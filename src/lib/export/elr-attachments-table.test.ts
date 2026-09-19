import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { ELR_ATTACHMENTS_HEADERS } from "@/lib/document-types/elr/sections";
import {
  applyElrLiveAttachmentsTable,
  elrAttachmentsTableDoc,
  posixAttachmentLocation,
} from "@/lib/export/elr-attachments-table";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
  ReportSectionRecord,
} from "@/types/report";

function attachment(
  overrides: Partial<ReportAttachmentRecord> &
    Pick<ReportAttachmentRecord, "id" | "filename">
): ReportAttachmentRecord {
  return {
    reportId: "elr-1",
    folderId: null,
    assetId: overrides.assetId ?? `asset-${overrides.id}`,
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 100,
    pageCount: null,
    processingStatus: "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-03-09T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function folder(
  overrides: Pick<ReportAttachmentFolderRecord, "id" | "name"> &
    Partial<ReportAttachmentFolderRecord>
): ReportAttachmentFolderRecord {
  return {
    reportId: "elr-1",
    parentId: null,
    createdAt: "2026-03-09T00:00:00.000Z",
    ...overrides,
  };
}

function cellTexts(doc: JSONContent | { content?: unknown[] }): string[][] {
  const table = (doc.content?.[0] ?? doc) as {
    content?: Array<{
      content?: Array<{
        content?: Array<{ content?: Array<{ text?: string }> }>;
      }>;
    }>;
  };
  return (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => {
      const para = cell.content?.[0];
      return para?.content?.[0]?.text ?? "";
    })
  );
}

describe("posixAttachmentLocation", () => {
  it("joins folderPathById display paths as /folder/subfolder", () => {
    const paths = new Map([
      ["sops", "SOPs"],
      ["year", "SOPs / 2026"],
    ]);
    expect(posixAttachmentLocation(null, paths)).toBe("/");
    expect(posixAttachmentLocation("sops", paths)).toBe("/SOPs");
    expect(posixAttachmentLocation("year", paths)).toBe("/SOPs/2026");
    expect(posixAttachmentLocation("missing", paths)).toBe("/");
  });
});

describe("elrAttachmentsTableDoc", () => {
  it("lists every live file, including uncited and failed ingest", () => {
    const folders = [
      folder({ id: "sops", name: "SOPs" }),
      folder({ id: "year", name: "2026", parentId: "sops" }),
    ];
    const doc = elrAttachmentsTableDoc(
      [
        attachment({
          id: "a1",
          filename: "URS-FP-21-006_20250320092518.pdf",
          folderId: "year",
          pageCount: 12,
        }),
        attachment({
          id: "a2",
          filename: "scan.pdf",
          folderId: null,
          pageCount: null,
          processingStatus: "failed",
          processingError: "extract failed",
        }),
        attachment({
          id: "a3",
          filename: "deleted.pdf",
          deletedAt: "2026-03-10T00:00:00.000Z",
        }),
      ],
      folders
    );

    const rows = cellTexts(doc);
    expect(rows[0]).toEqual([...ELR_ATTACHMENTS_HEADERS]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      "1",
      "1",
      "URS-FP-21-006.pdf",
      "URS-FP-21-006",
      "12",
      "/SOPs/2026",
    ]);
    expect(rows[2]).toEqual(["2", "2", "scan.pdf", "scan", "", "/"]);
  });

  it("dedupes the same vault asset and seeds an empty grid when there are no files", () => {
    const duped = elrAttachmentsTableDoc([
      attachment({ id: "a1", filename: "a.pdf", assetId: "shared" }),
      attachment({ id: "a2", filename: "a.pdf", assetId: "shared" }),
    ]);
    expect(cellTexts(duped)).toHaveLength(2);

    const empty = elrAttachmentsTableDoc([]);
    expect(cellTexts(empty)[0]).toEqual([...ELR_ATTACHMENTS_HEADERS]);
    expect(cellTexts(empty)).toHaveLength(2);
    expect(cellTexts(empty)[1].every((cell) => cell === "")).toBe(true);
  });
});

describe("applyElrLiveAttachmentsTable", () => {
  it("replaces only the attachments section table", () => {
    const sections: ReportSectionRecord[] = [
      {
        id: "obj",
        reportId: "elr-1",
        section: "elr_objective",
        content: { narrative: { type: "doc", content: [] } },
        updatedAt: "2026-03-09T00:00:00.000Z",
      },
      {
        id: "att",
        reportId: "elr-1",
        section: "elr_attachments",
        content: { table: { type: "doc", content: [] } },
        updatedAt: "2026-03-09T00:00:00.000Z",
      },
    ];
    const next = applyElrLiveAttachmentsTable(sections, [
      attachment({ id: "a1", filename: "protocol.pdf", pageCount: 3 }),
    ]);
    expect(next[0]).toEqual(sections[0]);
    const table = (next[1]?.content as { table: JSONContent }).table;
    expect(cellTexts(table)[1]?.[2]).toBe("protocol.pdf");
  });
});
