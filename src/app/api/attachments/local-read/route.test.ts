import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/attachments/local-read/route";
import {
  LocalAttachmentStorage,
  localObjectPathForTests,
  resetAttachmentStorageForTests,
  signLocalReadUrlParams,
  stagingObjectKey,
} from "@/lib/storage/attachments";

// Scoped to this spec's own key: the on-disk root is shared with
// src/lib/storage/attachments.test.ts, which runs in a parallel worker.
const ownedObjectDir = path.dirname(
  localObjectPathForTests(stagingObjectKey("route_att"))
);

describe("GET /api/attachments/local-read", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    resetAttachmentStorageForTests();
    await rm(ownedObjectDir, { recursive: true, force: true });
  });

  async function seedObject() {
    vi.stubEnv("ATTACHMENT_STORAGE_BACKEND", "local");
    vi.stubEnv("ALLOW_LOCAL_ATTACHMENT_STORAGE", "true");
    vi.stubEnv("AUTH_SECRET", "local-read-route-secret");

    const storage = new LocalAttachmentStorage();
    const objectKey = stagingObjectKey("route_att");
    await storage.writeObjectBuffer(
      objectKey,
      Buffer.from("%PDF-route-test"),
      "application/pdf"
    );
    const metadata = await storage.getObjectMetadata(objectKey);
    return { objectKey, generation: metadata.generation };
  }

  it("serves bytes for a valid signed URL", async () => {
    const { objectKey, generation } = await seedObject();
    const expiresAt = Date.now() + 60_000;
    const sig = signLocalReadUrlParams(objectKey, generation, expiresAt);
    const req = new Request(
      `http://localhost/api/attachments/local-read?key=${encodeURIComponent(objectKey)}&generation=${encodeURIComponent(generation)}&expiresAt=${expiresAt}&sig=${encodeURIComponent(sig)}`
    );

    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-route-test");
  });

  it("rejects expiresAt extension without a matching signature", async () => {
    const { objectKey, generation } = await seedObject();
    const expiresAt = Date.now() + 60_000;
    const sig = signLocalReadUrlParams(objectKey, generation, expiresAt);
    const tamperedExpiresAt = expiresAt + 86_400_000;
    const req = new Request(
      `http://localhost/api/attachments/local-read?key=${encodeURIComponent(objectKey)}&generation=${encodeURIComponent(generation)}&expiresAt=${tamperedExpiresAt}&sig=${encodeURIComponent(sig)}`
    );

    const response = await GET(req);
    expect(response.status).toBe(403);
  });

  it("rejects unsigned URLs", async () => {
    const { objectKey, generation } = await seedObject();
    const expiresAt = Date.now() + 60_000;
    const req = new Request(
      `http://localhost/api/attachments/local-read?key=${encodeURIComponent(objectKey)}&generation=${encodeURIComponent(generation)}&expiresAt=${expiresAt}`
    );

    const response = await GET(req);
    expect(response.status).toBe(403);
  });
});
