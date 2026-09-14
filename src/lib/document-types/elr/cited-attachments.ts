import type { JSONContent } from "@tiptap/core";
import {
  parseSourceCitation,
  sourceCitationLinkSpans,
} from "@/lib/placeholders/citation-bracket";
import { extractCitationBrackets } from "@/lib/suggestions/citations-at-end";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { ELR_ATTACHMENTS_HEADERS } from "./sections";

export type ElrCitedAttachment = {
  filename: string;
  documentRef: string;
};

const FILE_EXT_RE = /\.(pdf|docx)$/i;

function isTiptapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as JSONContent).type === "doc"
  );
}

function walkTipTapDocs(value: unknown, visit: (doc: JSONContent) => void): void {
  if (value == null) return;
  if (isTiptapDoc(value)) {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkTipTapDocs(item, visit);
    return;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      walkTipTapDocs(child, visit);
    }
  }
}

function stemFromFilename(filename: string): string {
  return filename.replace(FILE_EXT_RE, "").trim();
}

function attachmentKey(filename: string): string {
  return stemFromFilename(filename).toLowerCase();
}

function preferFilename(existing: string, incoming: string): string {
  const incomingHasExt = FILE_EXT_RE.test(incoming);
  const existingHasExt = FILE_EXT_RE.test(existing);
  if (incomingHasExt && !existingHasExt) return incoming;
  return existing;
}

function filenamesFromFieldText(text: string): string[] {
  const names: string[] = [];
  for (const match of extractCitationBrackets(text)) {
    for (const span of sourceCitationLinkSpans(match)) {
      const parsed = parseSourceCitation(span.openRaw);
      if (parsed?.filename) names.push(parsed.filename);
    }
  }
  return names;
}

function textCell(text: string): JSONContent {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  };
}

function dataRow(cells: readonly string[]): JSONContent {
  return {
    type: "tableRow",
    content: cells.map((text) => textCell(text)),
  };
}

function tableDocWithRows(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): JSONContent {
  const seeded = seededTableDoc(headers);
  const table = seeded.content?.[0];
  if (!table) return seeded;
  if (rows.length === 0) return seeded;
  table.content = [table.content?.[0] as JSONContent, ...rows.map(dataRow)];
  return seeded;
}

/**
 * Unique cited sources across ELR section fields, in first-seen order.
 * Same file cited on several pages (or as a stem vs `.pdf`) is one row.
 * Leftover `elr_attachments` editor rows are ignored — this list is the
 * citations, not a hand-maintained register.
 */
export function collectElrCitedAttachments(
  sections: Array<{ section: string; content: unknown }>
): ElrCitedAttachment[] {
  const byKey = new Map<string, ElrCitedAttachment>();
  const order: string[] = [];

  for (const row of sections) {
    if (row.section === "elr_attachments") continue;
    walkTipTapDocs(row.content, (doc) => {
      const text = flattenForAnchor(doc).text;
      for (const filename of filenamesFromFieldText(text)) {
        const key = attachmentKey(filename);
        if (!key) continue;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            filename,
            documentRef: stemFromFilename(filename),
          });
          order.push(key);
          continue;
        }
        existing.filename = preferFilename(existing.filename, filename);
        if (!existing.documentRef) {
          existing.documentRef = stemFromFilename(existing.filename);
        }
      }
    });
  }

  return order.map((key) => byKey.get(key)!);
}

/** TipTap table for `{@attachmentsTableXml}` — headers plus one row per cited file. */
export function buildElrCitedAttachmentsTable(
  sections: Array<{ section: string; content: unknown }>
): JSONContent {
  const cited = collectElrCitedAttachments(sections);
  if (cited.length === 0) {
    return seededTableDoc(ELR_ATTACHMENTS_HEADERS);
  }
  return tableDocWithRows(
    ELR_ATTACHMENTS_HEADERS,
    cited.map((row, index) => [
      String(index + 1),
      `Attachment-${index + 1}`,
      row.filename,
      row.documentRef,
    ])
  );
}
