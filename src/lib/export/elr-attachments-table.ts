import type { JSONContent } from "@tiptap/core";
import { folderPathById } from "@/lib/attachments/list-catalog";
import { citationDisplayFilename } from "@/lib/citations/citation-filename";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { ELR_ATTACHMENTS_HEADERS } from "@/lib/document-types/elr/sections";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
  ReportSectionRecord,
} from "@/types/report";

/**
 * Vault tree path as a POSIX directory (`/SOPs/2026`).
 * Root (no folder, or a missing folder id) is `/`.
 */
export function posixAttachmentLocation(
  folderId: string | null | undefined,
  pathById: ReadonlyMap<string, string>
): string {
  if (!folderId) return "/";
  const display = pathById.get(folderId);
  if (!display) return "/";
  const parts = display
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function documentRefFromFilename(filename: string): string {
  const display = citationDisplayFilename(filename);
  const dot = display.lastIndexOf(".");
  if (dot > 0) return display.slice(0, dot);
  return display;
}

function uniqueLiveAttachments(
  attachments: readonly ReportAttachmentRecord[]
): ReportAttachmentRecord[] {
  const seen = new Set<string>();
  const out: ReportAttachmentRecord[] = [];
  for (const file of attachments) {
    if (file.deletedAt) continue;
    const key = file.assetId ?? file.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

function tableCell(text: string, header: boolean): JSONContent {
  return {
    type: header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: text.length > 0 ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function tableRow(cells: readonly string[], header: boolean): JSONContent {
  return {
    type: "tableRow",
    content: cells.map((text) => tableCell(text, header)),
  };
}

/** TipTap attachments table: every live file, Location as `/folder/subfolder`. */
export function elrAttachmentsTableDoc(
  attachments: readonly ReportAttachmentRecord[],
  folders: readonly ReportAttachmentFolderRecord[] = []
): JSONContent {
  const live = uniqueLiveAttachments(attachments);
  if (live.length === 0) return seededTableDoc(ELR_ATTACHMENTS_HEADERS);

  const pathById = folderPathById(folders);
  const rows: JSONContent[] = [
    tableRow(ELR_ATTACHMENTS_HEADERS, true),
    ...live.map((file, index) => {
      const serial = String(index + 1);
      const title = citationDisplayFilename(file.filename);
      const pageCount =
        typeof file.pageCount === "number" && Number.isFinite(file.pageCount)
          ? String(file.pageCount)
          : "";
      return tableRow(
        [
          serial,
          serial,
          title,
          documentRefFromFilename(file.filename),
          pageCount,
          posixAttachmentLocation(file.folderId, pathById),
        ],
        false
      );
    }),
  ];
  return {
    type: "doc",
    content: [{ type: "table", content: rows }],
  };
}

/** Replace the stored Attachments table with the live file list. */
export function applyElrLiveAttachmentsTable(
  sections: ReportSectionRecord[],
  attachments: readonly ReportAttachmentRecord[],
  folders: readonly ReportAttachmentFolderRecord[] = []
): ReportSectionRecord[] {
  const table = elrAttachmentsTableDoc(attachments, folders);
  return sections.map((row) => {
    if (row.section !== "elr_attachments") return row;
    const existing =
      row.content && typeof row.content === "object"
        ? (row.content as Record<string, unknown>)
        : {};
    return { ...row, content: { ...existing, table } };
  });
}
