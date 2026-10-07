import type { JSONContent } from "@tiptap/core";
import { emptyDoc, normalizeRichField } from "@/lib/tiptap/rich-text";
import {
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_EQUIPMENT_DOCUMENTS_HEADERS,
  CVP_EQUIPMENT_IDENTITY_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  cvpEquipmentSamplingSeed,
  upgradeCvpEquipmentSamplingNarrative,
} from "@/lib/document-types/cvp/sections";

export const CVP_EQUIPMENT_FIELD_PATTERN = "items.[]";
export const CVP_EQUIPMENT_SAMPLING_SECTION = "cvp_equipment_sampling";

export type CvpEquipmentSamplingContent = { items: JSONContent[] };

const EQUIPMENT_TABLE_HEADERS: readonly (readonly string[])[] = [
  CVP_EQUIPMENT_IDENTITY_HEADERS,
  CVP_EQUIPMENT_DOCUMENTS_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
];

const HEADING_ORDINAL_RE = /^(15\.(?:N|\d+))/;
const ITEM_FIELD_RE = /^items\.(\d+)$/;

export function isCvpEquipmentItemField(path: string): boolean {
  return ITEM_FIELD_RE.test(path);
}

export function cvpEquipmentItemIndex(path: string): number | null {
  const match = ITEM_FIELD_RE.exec(path);
  if (!match) return null;
  return Number(match[1]);
}

export function cvpEquipmentItemAnchor(index: number): string {
  return `${CVP_EQUIPMENT_SAMPLING_SECTION}-item-${index}`;
}

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function headingText(node: JSONContent): string {
  return nodePlain(node).replace(/\s+/g, " ").trim();
}

function nodeHasSuggestionMarks(node: JSONContent): boolean {
  if (
    (node.marks ?? []).some(
      (mark) =>
        mark.type === "suggestionInsert" || mark.type === "suggestionDelete"
    )
  ) {
    return true;
  }
  return (node.content ?? []).some(nodeHasSuggestionMarks);
}

function retitleHeadingText(text: string, ordinal: number): string | null {
  const match = HEADING_ORDINAL_RE.exec(text);
  if (!match) return null;
  const next = `15.${ordinal}${text.slice(match[1]!.length)}`;
  return next === text ? null : next;
}

function rowCells(row: JSONContent): string[] {
  return (row.content ?? [])
    .filter((cell) => cell.type === "tableHeader" || cell.type === "tableCell")
    .map((cell) => nodePlain(cell).replace(/\s+/g, " ").trim());
}

function rowMatchesHeader(
  cells: readonly string[],
  header: readonly string[]
): boolean {
  if (cells.length < header.length) return false;
  return header.every(
    (label, i) => (cells[i] ?? "").toLowerCase() === label.toLowerCase()
  );
}

function asHeaderRow(row: JSONContent): JSONContent {
  return {
    ...row,
    type: "tableRow",
    content: (row.content ?? []).map((cell) =>
      cell.type === "tableHeader" ? cell : { ...cell, type: "tableHeader" }
    ),
  };
}

/**
 * Apply All of a multi-table draft_field dump pastes every GFM grid into the
 * first identity table (Documents / Location ID / … appear as data rows).
 * Split those header-rows back into their own tables.
 */
export function splitWarpedCvpEquipmentTables(doc: JSONContent): JSONContent {
  const next: JSONContent[] = [];
  for (const node of doc.content ?? []) {
    if (node.type !== "table") {
      next.push(node);
      continue;
    }
    const rows = node.content ?? [];
    if (rows.length === 0) {
      next.push(node);
      continue;
    }
    const chunks: JSONContent[][] = [];
    let current = [rows[0]!];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const cells = rowCells(row);
      const matched = EQUIPMENT_TABLE_HEADERS.find((header) =>
        rowMatchesHeader(cells, header)
      );
      const currentHeader = rowCells(current[0]!);
      if (
        matched &&
        !rowMatchesHeader(currentHeader, matched)
      ) {
        chunks.push(current);
        current = [asHeaderRow(row)];
        continue;
      }
      current.push(row);
    }
    chunks.push(current);
    for (const chunk of chunks) {
      next.push({ type: "table", content: chunk });
    }
  }
  return { type: "doc", content: next };
}

export function splitCvpEquipmentDocIntoItems(doc: JSONContent): JSONContent[] {
  const groups: JSONContent[][] = [];
  let current: JSONContent[] = [];
  for (const node of doc.content ?? []) {
    const isH2 =
      node.type === "heading" && Number(node.attrs?.level) === 2 && current.length > 0;
    if (isH2) {
      groups.push(current);
      current = [node];
      continue;
    }
    current.push(node);
  }
  if (current.length > 0) groups.push(current);
  if (groups.length === 0) return [emptyDoc()];
  return groups.map((content) => ({ type: "doc" as const, content }));
}

export function retitleCvpEquipmentDoc(
  doc: JSONContent,
  ordinal: number
): JSONContent {
  return {
    type: "doc",
    content: (doc.content ?? []).map((node) => {
      if (node.type !== "heading") return node;
      // Rewriting the heading node would flatten pending insert/delete marks
      // and desync propose_edit anchors (15.N → 15.1) so Apply cannot locate.
      if (nodeHasSuggestionMarks(node)) return node;
      const text = headingText(node);
      if (!text) return node;
      const nextText =
        retitleHeadingText(text, ordinal) ??
        (Number(node.attrs?.level) === 2 && !HEADING_ORDINAL_RE.test(text)
          ? `15.${ordinal} ${text}`
          : null);
      if (!nextText) return node;
      return {
        ...node,
        content: [{ type: "text", text: nextText }],
      };
    }),
  };
}

export function cvpEquipmentItemTitle(doc: JSONContent, ordinal: number): string {
  const h2 = (doc.content ?? []).find(
    (node) => node.type === "heading" && Number(node.attrs?.level) === 2
  );
  const text = h2 ? headingText(h2) : "";
  return text || `15.${ordinal} Equipment name (Equipment No.)`;
}

function normalizeItem(doc: JSONContent, _ordinal: number): JSONContent {
  const upgraded = upgradeCvpEquipmentSamplingNarrative(
    normalizeRichField(doc, { preserveHeadings: true })
  );
  // Do not retitle on merge — Duplicate / Add / Remove retitle explicitly.
  // Auto-renumbering 15.N → 15.1 here made heading suggestions un-locatable.
  return splitWarpedCvpEquipmentTables(upgraded);
}

function docsFromRaw(raw: unknown): JSONContent[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [cvpEquipmentSamplingSeed(1)];
  }
  const rec = raw as Record<string, unknown>;
  if (Array.isArray(rec.items)) {
    const items = rec.items
      .filter((item) => item && typeof item === "object")
      .map((item) => item as JSONContent);
    return items.length > 0 ? items : [emptyDoc()];
  }
  if (Object.prototype.hasOwnProperty.call(rec, "narrative")) {
    const narrative = upgradeCvpEquipmentSamplingNarrative(
      normalizeRichField(rec.narrative, { preserveHeadings: true })
    );
    return splitCvpEquipmentDocIntoItems(splitWarpedCvpEquipmentTables(narrative));
  }
  // Missing both keys = never written (new report uses emptyContent with items).
  // Do not treat a wiped `{}` as a reason to put the seed back.
  return [emptyDoc()];
}

export function normalizeCvpEquipmentSamplingContent(
  raw: unknown
): CvpEquipmentSamplingContent {
  const docs = docsFromRaw(raw).map((doc, index) => normalizeItem(doc, index + 1));
  return { items: docs.length > 0 ? docs : [emptyDoc()] };
}

export function concatCvpEquipmentItems(content: unknown): JSONContent {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  return {
    type: "doc",
    content: items.flatMap((item) => item.content ?? []),
  };
}

export function duplicateCvpEquipmentItem(
  items: JSONContent[],
  sourceIndex: number
): JSONContent[] {
  const source = items[sourceIndex] ?? cvpEquipmentSamplingSeed(items.length + 1);
  const next = [
    ...items.slice(0, sourceIndex + 1),
    structuredClone(source),
    ...items.slice(sourceIndex + 1),
  ];
  return next.map((doc, index) => retitleCvpEquipmentDoc(doc, index + 1));
}

export function appendCvpEquipmentItem(items: JSONContent[]): JSONContent[] {
  const next = [...items, cvpEquipmentSamplingSeed(items.length + 1)];
  return next.map((doc, index) => retitleCvpEquipmentDoc(doc, index + 1));
}

export function removeCvpEquipmentItem(
  items: JSONContent[],
  index: number
): JSONContent[] {
  if (items.length <= 1) return items;
  const next = items.filter((_, i) => i !== index);
  return next.map((doc, i) => retitleCvpEquipmentDoc(doc, i + 1));
}

export function ensureCvpEquipmentItem(
  content: Record<string, unknown>,
  index: number
): CvpEquipmentSamplingContent {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  while (items.length <= index) {
    items.push(cvpEquipmentSamplingSeed(items.length + 1));
  }
  return {
    items: items.map((doc, i) => retitleCvpEquipmentDoc(doc, i + 1)),
  };
}

/** Replace the H2 title on a seeded item; keep the outline tables. */
export function applyCvpEquipmentHeadingMarkdown(
  item: JSONContent,
  markdown: string,
  ordinal: number
): JSONContent {
  const titleLine = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .find((line) => line.length > 0);
  if (!titleLine) return retitleCvpEquipmentDoc(item, ordinal);
  const titled: JSONContent = {
    type: "doc",
    content: (item.content ?? []).map((node) => {
      if (node.type === "heading" && Number(node.attrs?.level) === 2) {
        return {
          ...node,
          content: [{ type: "text", text: titleLine }],
        };
      }
      return node;
    }),
  };
  return retitleCvpEquipmentDoc(titled, ordinal);
}

export function cvpEquipmentTocChildren(content: unknown): Array<{
  label: string;
  sectionKey: typeof CVP_EQUIPMENT_SAMPLING_SECTION;
  jumpId: string;
}> {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  return items.map((doc, index) => ({
    label: cvpEquipmentItemTitle(doc, index + 1),
    sectionKey: CVP_EQUIPMENT_SAMPLING_SECTION,
    jumpId: cvpEquipmentItemAnchor(index),
  }));
}
