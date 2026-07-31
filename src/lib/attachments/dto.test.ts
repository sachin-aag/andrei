import { describe, expect, it } from "vitest";
import { toAttachmentDto } from "./dto";

describe("toAttachmentDto", () => {
  it("omits internal storage and integrity fields", () => {
    const dto = toAttachmentDto({
      id: "att_1",
      reportId: "rep_1",
      filename: "batch.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "abc",
      stagingObjectKey: "staging/attachments/att_1/source.pdf",
      permanentObjectKey: "reports/rep_1/attachments/att_1/source.pdf",
      gcsGeneration: "123",
      crc32c: "crc",
      pageCount: 3,
      processingStatus: "ready",
      processingProgress: 100,
      processingError: null,
      activeIngestRunId: "run_1",
      uploadedById: "user_1",
      uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
      deletedById: null,
    });

    expect(dto).toEqual({
      id: "att_1",
      reportId: "rep_1",
      filename: "batch.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      pageCount: 3,
      processingStatus: "ready",
      processingProgress: 100,
      processingError: null,
      uploadedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    expect(dto).not.toHaveProperty("sha256");
    expect(dto).not.toHaveProperty("stagingObjectKey");
    expect(dto).not.toHaveProperty("permanentObjectKey");
    expect(dto).not.toHaveProperty("gcsGeneration");
    expect(dto).not.toHaveProperty("uploadedById");
    expect(dto).not.toHaveProperty("activeIngestRunId");
  });
});
