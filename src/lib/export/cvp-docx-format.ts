import type { JSONContent } from "@tiptap/core";
import type { CvpSectionKey } from "@/lib/document-types/cvp/sections";
import { CVP_SECTION_LABELS } from "@/lib/document-types/cvp/sections";

/**
 * Source QAD-SOP-PS-003-F08-00 numbering: `w:numId` 3 → abstract `%1.0` /
 * `%1.%2`. Must match `templates/3xper-cleaning-verification-protocol-template.docx`.
 */
export const CVP_DOCX_HEADING_NUM_ID = 3;

/** 15.x continuations — ilvl 1 so Testing stays 16.0. */
const CVP_DOCX_ILVL1_KEYS = new Set<CvpSectionKey>([
  "cvp_nitrosamine",
  "cvp_pgi",
  "cvp_process_line",
  "cvp_manufacturing_area",
  "cvp_overall_results",
]);

const OUTLINE_NUMBER_RE = /^\d+(?:\.\d+)*\.?\s+/;
const TABLE_CAPTION_RE = /^Table\s+\d+\s*[.:]/i;
const TABLE_CAPTION_ONLY_RE = /^Table\s+\d+\.?\s*$/i;

export function stripCvpOutlineNumber(text: string): string {
  return text.replace(OUTLINE_NUMBER_RE, "").trim();
}

export function cvpHeadingCaps(text: string): string {
  return stripCvpOutlineNumber(text).toUpperCase();
}

export function cvpTemplateHeadingSpec(key: CvpSectionKey): {
  text: string;
  ilvl: 0 | 1;
} {
  return {
    text: cvpHeadingCaps(CVP_SECTION_LABELS[key]),
    ilvl: CVP_DOCX_ILVL1_KEYS.has(key) ? 1 : 0,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Live Word TOC field (`TOC \o "1-1"`) — Heading1 only, matching the source protocol. */
export function cvpWordTocXml(): string {
  return (
    `<w:sdt>` +
    `<w:sdtPr>` +
    `<w:docPartObj>` +
    `<w:docPartGallery w:val="Table of Contents"/>` +
    `<w:docPartUnique/>` +
    `</w:docPartObj>` +
    `</w:sdtPr>` +
    `<w:sdtContent>` +
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="TOCHeading"/><w:outlineLvl w:val="9"/>` +
    `<w:ind w:left="0" w:firstLine="0"/>` +
    `<w:spacing w:before="23" w:line="360" w:lineRule="auto"/>` +
    `</w:pPr>` +
    `<w:r><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>` +
    `<w:t xml:space="preserve">TABLE OF CONTENTS</w:t></w:r>` +
    `</w:p>` +
    `<w:p>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t xml:space="preserve">Right-click and choose Update Field to refresh this table of contents.</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p>` +
    `</w:sdtContent>` +
    `</w:sdt>`
  );
}

export function cvpHeadingParagraphXml(text: string, ilvl: 0 | 1): string {
  return (
    `<w:p><w:pPr>` +
    `<w:pStyle w:val="Heading1"/>` +
    `<w:keepNext/>` +
    `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${CVP_DOCX_HEADING_NUM_ID}"/></w:numPr>` +
    `<w:spacing w:before="23" w:line="360" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `</w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` +
    `</w:p>`
  );
}

function nodePlainText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map((child) => nodePlainText(child)).join("");
}

function isTableCaptionNode(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  const text = nodePlainText(node).trim();
  return TABLE_CAPTION_RE.test(text) || TABLE_CAPTION_ONLY_RE.test(text);
}

function isTableCell(node: JSONContent): boolean {
  return node.type === "tableCell" || node.type === "tableHeader";
}

function firstBodyCell(row: JSONContent): JSONContent | undefined {
  return (row.content ?? []).find(isTableCell);
}

function withRowspan(cell: JSONContent, rowspan: number): JSONContent {
  return {
    ...cell,
    attrs: { ...cell.attrs, rowspan },
  };
}

function dropFirstCell(row: JSONContent): JSONContent {
  let dropped = false;
  return {
    ...row,
    content: (row.content ?? []).filter((child) => {
      if (dropped || !isTableCell(child)) return true;
      dropped = true;
      return false;
    }),
  };
}

function mergeEmptyFirstColumnOnTable(table: JSONContent): JSONContent {
  const rows = [...(table.content ?? [])];
  if (rows.length < 3) return table;

  const next: JSONContent[] = rows.map((row) => ({
    ...row,
    content: [...(row.content ?? [])],
  }));
  let i = 1;
  while (i < next.length) {
    const startCell = firstBodyCell(next[i]!);
    const startText = nodePlainText(startCell).trim();
    if (!startCell || !startText) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < next.length && nodePlainText(firstBodyCell(next[j]!)).trim() === "") {
      j += 1;
    }
    const run = j - i;
    if (run > 1) {
      const rowCells = next[i]!.content ?? [];
      const idx = rowCells.findIndex(isTableCell);
      if (idx >= 0) {
        next[i] = {
          ...next[i]!,
          content: rowCells.map((cell, cellIdx) =>
            cellIdx === idx ? withRowspan(cell, run) : cell
          ),
        };
      }
      for (let k = i + 1; k < j; k += 1) {
        next[k] = dropFirstCell(next[k]!);
      }
    }
    i = j;
  }

  return { ...table, content: next };
}

function mapDocNodes(
  doc: JSONContent,
  mapNode: (node: JSONContent) => JSONContent
): JSONContent {
  const visit = (node: JSONContent): JSONContent => {
    const mapped = mapNode(node);
    if (!mapped.content?.length) return mapped;
    return { ...mapped, content: mapped.content.map(visit) };
  };
  return visit(doc);
}

/** Consecutive empty first-column body cells become a Word vMerge (Reviewed by). */
export function applyCvpEmptyFirstColumnMerges(doc: JSONContent): JSONContent {
  return mapDocNodes(doc, (node) =>
    node.type === "table" ? mergeEmptyFirstColumnOnTable(node) : node
  );
}

/** Source protocol tables are untitled; drop editor `Table N.` captions. */
export function stripTableCaptionNodes(doc: JSONContent): JSONContent {
  const visit = (node: JSONContent): JSONContent => {
    if (!node.content?.length) return node;
    return {
      ...node,
      content: node.content
        .filter((child) => !isTableCaptionNode(child))
        .map(visit),
    };
  };
  return visit(doc);
}

export const CVP_PAGE_BREAK_XML =
  `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
