import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/attachments/folders", () => ({
  listAttachmentFolders: vi.fn(),
}));

vi.mock("@/lib/storage/attachments", () => ({
  getAttachmentStorage: vi.fn(),
}));

vi.mock("@/lib/attachments/zip-stream", () => ({
  createAttachmentsZipStream: vi.fn(() => new ReadableStream()),
}));

import { db } from "@/db";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import { createAttachmentsZipStream } from "@/lib/attachments/zip-stream";
import { getAttachmentStorage } from "@/lib/storage/attachments";
import { loadAttachmentsDownloadZip } from "./download-all-zip";

function mockSelectOrderBy(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("loadAttachmentsDownloadZip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAttachmentFolders).mockResolvedValue([]);
    vi.mocked(getAttachmentStorage).mockReturnValue({
      openObjectReadStream: vi.fn(),
    } as never);
  });

  it("returns null when no attachment has been stored yet", async () => {
    mockSelectOrderBy([
      {
        id: "att-1",
        filename: "uploading.pdf",
        folderId: null,
        permanentObjectKey: "reports/r/attachments/att-1/source.pdf",
        gcsGeneration: null,
      },
    ]);

    await expect(
      loadAttachmentsDownloadZip("report-1", "DEV-001")
    ).resolves.toBeNull();
    expect(createAttachmentsZipStream).not.toHaveBeenCalled();
  });

  it("streams stored files with folder paths", async () => {
    vi.mocked(listAttachmentFolders).mockResolvedValue([
      {
        id: "f1",
        reportId: "report-1",
        parentId: null,
        name: "Batch Records",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mockSelectOrderBy([
      {
        id: "att-1",
        filename: "coa.pdf",
        folderId: "f1",
        permanentObjectKey: "reports/r/attachments/att-1/source.pdf",
        gcsGeneration: "1",
      },
    ]);

    const result = await loadAttachmentsDownloadZip("report-1", "DEV-001");

    expect(result?.filename).toBe("Attachments_DEV-001.zip");
    expect(createAttachmentsZipStream).toHaveBeenCalledWith([
      expect.objectContaining({ zipPath: "Batch Records/coa.pdf" }),
    ]);
  });
});
