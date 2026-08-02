import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GcsAttachmentStorage,
  isLocalAttachmentStorageEnabled,
  LocalAttachmentStorage,
  permanentObjectKey,
  resetAttachmentStorageForTests,
  stagingObjectKey,
  tempBatchObjectKey,
} from "./attachments";
import { resetWifTokenCache } from "@/lib/gcp/wif-token";

const localRoot = path.join(process.cwd(), ".data", "attachments");

describe("attachment storage key builders", () => {
  it("builds object keys without client filenames", () => {
    expect(stagingObjectKey("att_1")).toBe(
      "staging/attachments/att_1/source.pdf"
    );
    expect(permanentObjectKey("rep_1", "att_1")).toBe(
      "reports/rep_1/attachments/att_1/source.pdf"
    );
    expect(tempBatchObjectKey("att_1", "run_1", 2)).toBe(
      "temp/attachments/att_1/ingest-runs/run_1/batches/2.pdf"
    );
  });
});

describe("isLocalAttachmentStorageEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetWifTokenCache();
    resetAttachmentStorageForTests();
  });

  it("requires both explicit flags, including under NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATTACHMENT_STORAGE_BACKEND", "local");
    vi.stubEnv("ALLOW_LOCAL_ATTACHMENT_STORAGE", "true");
    expect(isLocalAttachmentStorageEnabled()).toBe(true);

    vi.stubEnv("ALLOW_LOCAL_ATTACHMENT_STORAGE", "false");
    expect(isLocalAttachmentStorageEnabled()).toBe(false);
  });
});

describe("GcsAttachmentStorage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetWifTokenCache();
    resetAttachmentStorageForTests();
  });

  it("creates a direct signed GCS read URL using WIF signBlob", async () => {
    vi.stubEnv(
      "GCP_WIF_AUDIENCE",
      "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v"
    );
    vi.stubEnv(
      "GCP_SERVICE_ACCOUNT_EMAIL",
      "runtime@example.iam.gserviceaccount.com"
    );
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "federated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "ya29.access",
            expireTime: new Date(Date.now() + 3_600_000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedBlob: "--__" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const storage = new GcsAttachmentStorage("andrei-test-bucket");
    const url = await storage.getSignedReadUrl({
      objectKey: "reports/report 1/attachments/att/source.pdf",
      generation: "12345",
      expiresInSeconds: 300,
      downloadFilename: "source.pdf",
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://storage.googleapis.com");
    expect(parsed.pathname).toBe(
      "/andrei-test-bucket/reports/report%201/attachments/att/source.pdf"
    );
    expect(parsed.searchParams.get("generation")).toBe("12345");
    expect(parsed.searchParams.get("X-Goog-Algorithm")).toBe(
      "GOOG4-RSA-SHA256"
    );
    expect(parsed.searchParams.get("X-Goog-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Goog-Signature")).toBe(
      "fbefff"
    );
    expect(parsed.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="source.pdf"'
    );
    expect(String(fetchMock.mock.calls[2]![0])).toContain(":signBlob");
  });
});

describe("LocalAttachmentStorage", () => {
  afterEach(async () => {
    await rm(localRoot, { recursive: true, force: true });
  });

  it("writes, reads, copies, and deletes objects", async () => {
    const storage = new LocalAttachmentStorage();
    const sourceKey = stagingObjectKey("local_att");
    const targetKey = permanentObjectKey("local_report", "local_att");
    const buffer = Buffer.from("%PDF-local-test");

    await storage.writeObjectBuffer(sourceKey, buffer, "application/pdf");
    await expect(storage.readObjectBuffer(sourceKey)).resolves.toEqual(buffer);

    const sourceMetadata = await storage.getObjectMetadata(sourceKey);
    expect(sourceMetadata).toMatchObject({
      sizeBytes: buffer.byteLength,
      contentType: "application/pdf",
    });

    await storage.copyObject(sourceKey, targetKey);
    await expect(storage.readObjectBuffer(targetKey)).resolves.toEqual(buffer);

    const stream = await storage.openObjectReadStream(targetKey);
    const streamed = Buffer.from(await new Response(stream).arrayBuffer());
    expect(streamed).toEqual(buffer);

    await storage.deleteObject(sourceKey);
    await expect(storage.readObjectBuffer(sourceKey)).rejects.toThrow();
  });
});
