import { describe, expect, it } from "vitest";
import {
  buildAttachmentCatalog,
  LIST_ATTACHMENTS_DEFAULT_LIMIT,
  LIST_ATTACHMENTS_MAX_LIMIT,
} from "./list-catalog";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";
import type { AttachmentProcessingStatus } from "@/db/schema";

function folder(
  id: string,
  name: string,
  parentId: string | null = null
): ReportAttachmentFolderRecord {
  return {
    id,
    reportId: "rep_1",
    parentId,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function file(opts: {
  id: string;
  filename: string;
  folderId?: string | null;
  pageCount?: number | null;
  processingStatus?: AttachmentProcessingStatus;
}): ReportAttachmentRecord {
  return {
    id: opts.id,
    reportId: "rep_1",
    folderId: opts.folderId ?? null,
    assetId: null,
    filename: opts.filename,
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    pageCount: opts.pageCount === undefined ? 2 : opts.pageCount,
    processingStatus: opts.processingStatus ?? "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("buildAttachmentCatalog", () => {
  it("counts every non-deleted file including still-ingesting ones", () => {
    const catalog = buildAttachmentCatalog({
      folders: [folder("f1", "SOPs")],
      attachments: [
        file({ id: "a1", filename: "ready.pdf" }),
        file({
          id: "a2",
          filename: "queued.pdf",
          processingStatus: "queued",
          pageCount: null,
        }),
        file({
          id: "a3",
          filename: "failed.pdf",
          folderId: "f1",
          processingStatus: "failed",
          pageCount: null,
        }),
      ],
    });

    expect(catalog.scope).toBe("all");
    expect(catalog.total).toBe(3);
    expect(catalog.ready).toBe(1);
    expect(catalog.notReady).toBe(2);
    expect(catalog.folderCount).toBe(1);
    expect(catalog.matched).toBe(3);
    expect(catalog.returned).toBe(3);
    expect(catalog.nextOffset).toBeNull();
    expect(catalog.files.map((row) => row.id)).toEqual(["a2", "a1", "a3"]);
    expect(catalog.files.find((row) => row.id === "a3")?.folderPath).toBe("SOPs");
  });

  it("builds nested folder paths and paginates without dropping totals", () => {
    const attachments = [
      file({ id: "root", filename: "root.pdf" }),
      file({ id: "sop", filename: "sop.pdf", folderId: "f1", pageCount: 4 }),
      file({
        id: "jan",
        filename: "jan.pdf",
        folderId: "f2",
        pageCount: 10,
      }),
    ];
    const folders = [folder("f1", "SOPs"), folder("f2", "2026", "f1")];
    const first = buildAttachmentCatalog({
      attachments,
      folders,
      limit: 2,
    });

    expect(first.files.map((row) => ({ id: row.id, folderPath: row.folderPath }))).toEqual(
      [
        { id: "jan", folderPath: "SOPs / 2026" },
        { id: "sop", folderPath: "SOPs" },
      ]
    );
    expect(first.total).toBe(3);
    expect(first.matched).toBe(3);
    expect(first.returned).toBe(2);
    expect(first.nextOffset).toBe(2);
    expect(first.pageCountSum).toBe(16);

    const second = buildAttachmentCatalog({
      attachments,
      folders,
      offset: first.nextOffset ?? 0,
      limit: 2,
    });
    expect(second.files.map((row) => row.id)).toEqual(["root"]);
    expect(second.nextOffset).toBeNull();
  });

  it("filters by filename or folder substring and by ready vs not_ready", () => {
    const attachments = [
      file({ id: "coa", filename: "Assay COA.pdf", folderId: "f1" }),
      file({
        id: "bmr",
        filename: "Seed-2 BMR.pdf",
        processingStatus: "processing",
        pageCount: null,
      }),
    ];
    const folders = [folder("f1", "Certificates")];

    const byFolder = buildAttachmentCatalog({
      attachments,
      folders,
      query: "cert",
    });
    expect(byFolder.matched).toBe(1);
    expect(byFolder.files[0]?.id).toBe("coa");

    const notReady = buildAttachmentCatalog({
      attachments,
      folders,
      status: "not_ready",
    });
    expect(notReady.matched).toBe(1);
    expect(notReady.files[0]?.id).toBe("bmr");
    expect(notReady.total).toBe(2);

    const ready = buildAttachmentCatalog({
      attachments,
      folders,
      status: "ready",
    });
    expect(ready.files.map((row) => row.id)).toEqual(["coa"]);
  });

  it("treats tagged ids as the complete scope", () => {
    const catalog = buildAttachmentCatalog({
      folders: [folder("f1", "SOPs")],
      attachments: [
        file({ id: "a1", filename: "one.pdf" }),
        file({ id: "a2", filename: "two.pdf", folderId: "f1" }),
        file({ id: "a3", filename: "three.pdf" }),
      ],
      pinnedAttachmentIds: ["a2", "missing"],
    });

    expect(catalog.scope).toBe("tagged");
    expect(catalog.total).toBe(1);
    expect(catalog.folderCount).toBe(1);
    expect(catalog.files[0]?.id).toBe("a2");
  });

  it("clamps limit to the catalog max", () => {
    const attachments = Array.from({ length: 90 }, (_, i) =>
      file({ id: `a${i}`, filename: `file-${String(i).padStart(2, "0")}.pdf` })
    );
    const catalog = buildAttachmentCatalog({
      attachments,
      folders: [],
      limit: 500,
    });
    expect(catalog.returned).toBe(LIST_ATTACHMENTS_MAX_LIMIT);
    expect(catalog.nextOffset).toBe(LIST_ATTACHMENTS_MAX_LIMIT);
    expect(catalog.total).toBe(90);
    expect(LIST_ATTACHMENTS_DEFAULT_LIMIT).toBe(50);
  });
});
