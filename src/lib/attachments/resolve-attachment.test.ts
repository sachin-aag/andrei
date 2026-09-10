import { describe, expect, it } from "vitest";
import type { attachmentAssets, reportAttachments } from "@/db/schema";
import { resolveAttachmentFields } from "./resolve-attachment";

describe("resolveAttachmentFields", () => {
  it("prefers asset ingest fields when a library asset is linked", () => {
    const row: Pick<
      typeof reportAttachments.$inferSelect,
      | "filename"
      | "description"
      | "mimeType"
      | "sizeBytes"
      | "pageCount"
      | "processingStatus"
      | "processingProgress"
      | "processingPage"
      | "processingError"
      | "sha256"
      | "stagingObjectKey"
      | "permanentObjectKey"
      | "gcsGeneration"
      | "crc32c"
      | "activeIngestRunId"
      | "uploadedAt"
      | "deletedAt"
    > = {
      filename: "report-name.pdf",
      description: "report note",
      mimeType: "application/pdf",
      sizeBytes: 1,
      pageCount: 1,
      processingStatus: "uploading",
      processingProgress: 0,
      processingPage: null,
      processingError: null,
      sha256: "",
      stagingObjectKey: "legacy/staging",
      permanentObjectKey: "legacy/permanent",
      gcsGeneration: null,
      crc32c: null,
      activeIngestRunId: null,
      uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    };
    const asset: Pick<
      typeof attachmentAssets.$inferSelect,
      | "filename"
      | "description"
      | "mimeType"
      | "sizeBytes"
      | "pageCount"
      | "processingStatus"
      | "processingProgress"
      | "processingPage"
      | "processingError"
      | "sha256"
      | "stagingObjectKey"
      | "permanentObjectKey"
      | "gcsGeneration"
      | "crc32c"
      | "activeIngestRunId"
      | "uploadedAt"
      | "deletedAt"
    > = {
      ...row,
      filename: "library-name.pdf",
      description: "library note",
      processingStatus: "ready",
      processingProgress: 100,
      pageCount: 12,
      sha256: "abc",
      stagingObjectKey: "staging/assets/a1/source",
      permanentObjectKey: "attachments/assets/a1/source",
      gcsGeneration: "gen",
      activeIngestRunId: "run_1",
    };

    const resolved = resolveAttachmentFields(
      row as typeof reportAttachments.$inferSelect,
      asset as typeof attachmentAssets.$inferSelect
    );

    expect(resolved.filename).toBe("report-name.pdf");
    expect(resolved.description).toBe("report note");
    expect(resolved.processingStatus).toBe("ready");
    expect(resolved.pageCount).toBe(12);
    expect(resolved.permanentObjectKey).toBe("attachments/assets/a1/source");
  });
});
