import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GcsAttachmentStorage,
  assertLocalUploadRangeWithinTotal,
  isLocalAttachmentStorageEnabled,
  LocalAttachmentStorage,
  localObjectPathForTests,
  permanentObjectKey,
  resetAttachmentStorageForTests,
  signLocalReadUrlParams,
  stagingObjectKey,
  tempBatchObjectKey,
  verifyLocalReadUrlParams,
} from "./attachments";
import { resetWifTokenCache } from "@/lib/gcp/wif-token";

const ownedObjectKeys = [
  stagingObjectKey("local_att"),
  stagingObjectKey("signed_att"),
  permanentObjectKey("local_report", "local_att"),
];

async function removeOwnedObjects(): Promise<void> {
  await Promise.all(
    ownedObjectKeys.map((objectKey) =>
      rm(path.dirname(localObjectPathForTests(objectKey)), {
        recursive: true,
        force: true,
      })
    )
  );
}

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
        new Response(JSON.stringify({ signedBlob: "c2lnbmF0dXJl" }), {
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
      "7369676e6174757265"
    );
    expect(parsed.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="source.pdf"'
    );
    expect(String(fetchMock.mock.calls[2]![0])).toContain(":signBlob");

    // GCS signs params in byte order; locale ordering would put `generation`
    // ahead of `X-Goog-*` and fail verification.
    const signedNames = [...parsed.searchParams.keys()].filter(
      (name) => name !== "X-Goog-Signature"
    );
    expect(signedNames).toEqual([...signedNames].sort());
  });
});

describe("LocalAttachmentStorage", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await removeOwnedObjects();
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

  it("HMAC-binds local read URL expiry so expiresAt cannot be extended alone", async () => {
    vi.stubEnv("AUTH_SECRET", "local-read-test-secret");
    const storage = new LocalAttachmentStorage();
    const objectKey = stagingObjectKey("signed_att");
    const generation = "gen-1";

    const url = await storage.getSignedReadUrl({
      objectKey,
      generation,
      expiresInSeconds: 300,
    });
    const params = new URL(url, "http://localhost").searchParams;
    const expiresAt = Number(params.get("expiresAt"));
    const sig = params.get("sig");

    expect(sig).toBeTruthy();
    expect(verifyLocalReadUrlParams(objectKey, generation, expiresAt, sig)).toBe(
      true
    );

    const extendedExpiresAt = expiresAt + 60 * 60 * 1000;
    expect(
      verifyLocalReadUrlParams(objectKey, generation, extendedExpiresAt, sig)
    ).toBe(false);
    expect(verifyLocalReadUrlParams(objectKey, generation, expiresAt, null)).toBe(
      false
    );
    expect(
      verifyLocalReadUrlParams(objectKey, "other-gen", expiresAt, sig)
    ).toBe(false);

    const reminted = signLocalReadUrlParams(
      objectKey,
      generation,
      extendedExpiresAt
    );
    expect(
      verifyLocalReadUrlParams(
        objectKey,
        generation,
        extendedExpiresAt,
        reminted
      )
    ).toBe(true);
  });

  it("rejects Content-Range chunks that exceed the declared total", () => {
    expect(() =>
      assertLocalUploadRangeWithinTotal({
        start: 0,
        end: 99,
        total: 50,
        chunkByteLength: 100,
        receivedBytes: 0,
        reservedSizeBytes: 50,
      })
    ).toThrow(/exceeds declared total/);

    expect(() =>
      assertLocalUploadRangeWithinTotal({
        start: 0,
        end: 49,
        total: 50,
        chunkByteLength: 50,
        receivedBytes: 0,
        reservedSizeBytes: 50,
      })
    ).not.toThrow();
  });
});
