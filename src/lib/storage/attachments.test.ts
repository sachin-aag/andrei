import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalAttachmentStorage,
  permanentObjectKey,
  stagingObjectKey,
  tempBatchObjectKey,
} from "./attachments";

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

    await storage.deleteObject(sourceKey);
    await expect(storage.readObjectBuffer(sourceKey)).rejects.toThrow();
  });
});
