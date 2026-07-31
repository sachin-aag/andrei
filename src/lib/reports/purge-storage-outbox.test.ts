import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import { collectAttachmentPurgeObjects } from "./purge-storage-outbox";

describe("collectAttachmentPurgeObjects", () => {
  it("builds purge outbox objects for permanent and staging attachment bytes", () => {
    expect(
      collectAttachmentPurgeObjects(
        [
          {
            id: "att-1",
            permanentObjectKey: "reports/report-1/attachments/att-1/source.pdf",
            stagingObjectKey: "staging/attachments/att-1/source.pdf",
            gcsGeneration: "123",
          },
        ],
        "bucket-1"
      )
    ).toEqual([
      {
        bucket: "bucket-1",
        objectKey: "reports/report-1/attachments/att-1/source.pdf",
        gcsGeneration: "123",
        attachmentId: "att-1",
      },
      {
        bucket: "bucket-1",
        objectKey: "staging/attachments/att-1/source.pdf",
        gcsGeneration: null,
        attachmentId: "att-1",
      },
    ]);
  });

  it("deduplicates identical object deletes", () => {
    expect(
      collectAttachmentPurgeObjects(
        [
          {
            id: "att-1",
            permanentObjectKey: "same.pdf",
            stagingObjectKey: "same.pdf",
            gcsGeneration: null,
          },
        ],
        "bucket-1"
      )
    ).toEqual([
      {
        bucket: "bucket-1",
        objectKey: "same.pdf",
        gcsGeneration: null,
        attachmentId: "att-1",
      },
    ]);
  });
});
