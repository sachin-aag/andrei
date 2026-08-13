import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { expect, it, vi } from "vitest";
import { GcsAttachmentStorage } from "./attachments";

const BUCKET = "andrei-493614-attachments";
const OBJECT =
  "reports/hnvzovt3jhbrcmzfermx4x37/attachments/qhezhmyqjnyb5n07owqr446l/source.pdf";
const EMAIL = "andrei-vercel@andrei-493614.iam.gserviceaccount.com";
const GENERATION = "1785682200349525";
// Both signers must see the same instant, and the SDK rejects past expiries,
// so anchor to the current clock rather than a fixed date.
const NOW = new Date();

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

async function sdkUrl(queryParams: Record<string, string>): Promise<string> {
  const storage = new Storage({
    projectId: "andrei-493614",
    credentials: { client_email: EMAIL, private_key: privateKey as string },
  });
  const [url] = await storage
    .bucket(BUCKET)
    .file(OBJECT)
    .getSignedUrl({
      action: "read",
      version: "v4",
      accessibleAt: NOW,
      expires: NOW.getTime() + 300_000,
      queryParams,
    });
  return url;
}

async function ourUrl(downloadFilename?: string): Promise<string> {
  vi.stubEnv(
    "GCP_WIF_AUDIENCE",
    "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v"
  );
  vi.stubEnv("GCP_SERVICE_ACCOUNT_EMAIL", EMAIL);
  vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes(":signBlob")) {
      const { payload } = JSON.parse(String(init?.body)) as { payload: string };
      return Response.json({
        signedBlob: cryptoSign(
          "RSA-SHA256",
          Buffer.from(payload, "base64"),
          privateKey
        ).toString("base64"),
      });
    }
    if (target.includes("generateAccessToken")) {
      return Response.json({
        accessToken: "ya29.access",
        expireTime: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    return Response.json({ access_token: "federated" });
  });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  try {
    return await new GcsAttachmentStorage(BUCKET).getSignedReadUrl({
      objectKey: OBJECT,
      generation: GENERATION,
      expiresInSeconds: 300,
      downloadFilename,
    });
  } finally {
    vi.useRealTimers();
  }
}

it.each([
  ["preview", undefined],
  ["download", "cursor-meetup-poster.pdf"],
])("matches the GCS SDK signature for %s", async (_label, filename) => {
  const queryParams: Record<string, string> = {
    generation: GENERATION,
    "response-content-type": "application/pdf",
  };
  if (filename) {
    queryParams["response-content-disposition"] =
      `attachment; filename="${filename}"`;
  }

  const expectedUrl = new URL(await sdkUrl(queryParams));
  const actualUrl = new URL(await ourUrl(filename));

  expect(actualUrl.pathname).toBe(expectedUrl.pathname);
  expect(actualUrl.searchParams.get("X-Goog-Date")).toBe(
    expectedUrl.searchParams.get("X-Goog-Date")
  );
  expect(actualUrl.searchParams.get("X-Goog-Signature")).toBe(
    expectedUrl.searchParams.get("X-Goog-Signature")
  );
});
