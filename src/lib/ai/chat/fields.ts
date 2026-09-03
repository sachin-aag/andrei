import type { JSONContent } from "@tiptap/core";
import type { DocumentType, SectionType } from "@/db/schema";
import { displaySectionLabel } from "@/types/sections";
import {
  SUGGEST_TARGET_FIELD_PATTERNS,
  isRichTargetField,
} from "@/lib/ai/suggest-target-fields";
import { getDocumentType } from "@/lib/document-types";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { renderStructuredFieldView } from "@/lib/ai/suggestion-section-context";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";
import {
  countImagesInDoc,
  flattenDocForChat,
  type SectionInlineImage,
} from "@/lib/ai/chat/section-images";

/** Sections the drafting chat can read + edit (type-owned, not DMAIC-only). */
export function chatEditableSections(
  documentType: DocumentType = "investigation_report"
): readonly SectionType[] {
  return getDocumentType(documentType)
    .sections.filter((s) => s.editable && !s.virtual)
    .map((s) => s.key);
}

/** `all` = no section filter; otherwise focus plan/edits on one tagged section. */
export type ChatSectionScope = SectionType | "all";

export const CHAT_SECTION_SCOPE_ALL = "all" as const;

export function isChatEditableSection(
  value: string,
  documentType: DocumentType = "investigation_report"
): value is SectionType {
  return (chatEditableSections(documentType) as readonly string[]).includes(value);
}

/** Sections included in prompt/tools for the current focus. */
export function chatSectionsInScope(
  scope: ChatSectionScope,
  documentType: DocumentType = "investigation_report"
): readonly SectionType[] {
  return scope === CHAT_SECTION_SCOPE_ALL
    ? chatEditableSections(documentType)
    : [scope];
}

export type ChatFieldKind = "rich" | "plain";

export type ChatTargetField = {
  /** In-section dot path, e.g. `narrative`, `rootCause.narrative`, `sixM.man`. */
  targetField: string;
  kind: ChatFieldKind;
};

/** Editable target fields for a section (the authoritative suggestion field set). */
export function chatTargetFields(section: SectionType): ChatTargetField[] {
  const patterns = SUGGEST_TARGET_FIELD_PATTERNS[section] ?? [];
  return patterns
    .filter((p) => !p.includes("[]"))
    .map((targetField) => ({
      targetField,
      kind: isRichTargetField(section, targetField) ? "rich" : "plain",
    }));
}

/** Primary draftable field per section — used for summaries + stub drafting. */
export function primaryFieldForSection(section: SectionType): string {
  switch (section) {
    case "analyze":
      return "rootCause.narrative";
    case "control":
      return "preventiveActions";
    case "traceability":
    case "test_results":
    case "test_equipment":
    case "qra_team":
    case "qra_risk_identification":
    case "qra_fmea":
    case "qra_mitigation":
    case "qra_residual_risk":
    case "qra_revision_history":
      return "table";
    case "testers_dates":
      return "testers";
    case "results_and_discussions":
      return "table";
    default:
      return "narrative";
  }
}

/**
 * Current plain-text value of an in-section field.
 * Rich fields use the canonical anchor string (same as locate/apply).
 */
export function sectionFieldPlainText(
  sectionContent: Record<string, unknown>,
  section: SectionType,
  targetField: string
): string {
  if (isRichTargetField(section, targetField)) {
    return flattenForAnchor(getRichFieldValue(sectionContent, targetField)).text;
  }
  return getPlainTextFieldValue(sectionContent, targetField);
}

/** Count inline images across all rich editable fields in a section. */
export function countSectionInlineImages(
  sectionContent: Record<string, unknown>,
  section: SectionType
): number {
  let total = 0;
  for (const field of chatTargetFields(section)) {
    if (field.kind !== "rich") continue;
    total += countImagesInDoc(getRichFieldValue(sectionContent, field.targetField));
  }
  return total;
}

/** Below this character count (and no images) a field is "partial", not empty. */
export const SECTION_PARTIAL_CHAR_LIMIT = 120;

export type FieldFillState = "empty" | "partial" | "filled";
export type SectionFillState = FieldFillState;

function fieldImageCount(
  content: Record<string, unknown>,
  section: SectionType,
  targetField: string
): number {
  if (!isRichTargetField(section, targetField)) return 0;
  return countImagesInDoc(getRichFieldValue(content, targetField));
}

/** Live tables in one rich field (headers from the section, not the pack recipe). */
export function listFieldTables(
  content: Record<string, unknown> | undefined,
  section: SectionType,
  targetField: string
): Array<{ tableIndex: number; headers: string[]; dataRowCount: number }> {
  if (!isRichTargetField(section, targetField)) return [];
  return summarizeTablesInDoc(getRichFieldValue(content ?? {}, targetField)).map(
    ({ tableIndex, headers, dataRowCount }) => ({
      tableIndex,
      headers,
      dataRowCount,
    })
  );
}

/** True when any editable rich field in the section already has a table. */
export function sectionHasTable(
  content: Record<string, unknown> | undefined,
  section: SectionType
): boolean {
  return chatTargetFields(section).some(
    (field) => listFieldTables(content, section, field.targetField).length > 0
  );
}

function isBlankTableCellText(text: string): boolean {
  return text === "(empty)" || text.trim() === "";
}

function nodeHasVisibleContent(node: JSONContent): boolean {
  if (node.type === "text" && (node.text ?? "").trim()) return true;
  if (node.type === "image" || node.type === "imageInline") return true;
  for (const child of node.content ?? []) {
    if (nodeHasVisibleContent(child)) return true;
  }
  return false;
}

function docHasNonTableContent(doc: JSONContent): boolean {
  for (const node of doc.content ?? []) {
    if (node.type === "table") continue;
    if (nodeHasVisibleContent(node)) return true;
  }
  return false;
}

/**
 * Header-only seeded tables (blank data cells, no surrounding prose/images)
 * are empty shells — not partial drafts. `sectionHasTable` still sees them
 * so `tableSchemaReadStep` copies live headers before `edit_table`.
 */
export function isEmptyTableScaffoldDoc(doc: JSONContent): boolean {
  const tables = summarizeTablesInDoc(doc);
  if (tables.length === 0) return false;
  if (countImagesInDoc(doc) > 0) return false;
  if (docHasNonTableContent(doc)) return false;
  for (const table of tables) {
    for (const cell of table.cells) {
      if (cell.row === 0) continue;
      if (!isBlankTableCellText(cell.text)) return false;
    }
  }
  return true;
}

export function fieldFillState(
  content: Record<string, unknown> | undefined,
  section: SectionType,
  targetField: string
): FieldFillState {
  const record = content ?? {};
  if (isRichTargetField(section, targetField)) {
    const doc = getRichFieldValue(record, targetField);
    if (isEmptyTableScaffoldDoc(doc)) return "empty";
  }
  const text = sectionFieldPlainText(record, section, targetField);
  const charCount = text.replace(/\s+/g, " ").trim().length;
  const imageCount = fieldImageCount(record, section, targetField);
  if (charCount === 0 && imageCount === 0) return "empty";
  if (charCount < SECTION_PARTIAL_CHAR_LIMIT && imageCount === 0) {
    return "partial";
  }
  return "filled";
}

/**
 * Aggregate of per-field fill state. Empty only when every editable field is
 * empty — a populated table is not hidden behind an empty narrative.
 */
export function sectionFillState(
  content: Record<string, unknown> | undefined,
  section: SectionType
): SectionFillState {
  const fields = chatTargetFields(section);
  if (fields.length === 0) {
    return fieldFillState(content, section, primaryFieldForSection(section));
  }
  const states = fields.map((field) =>
    fieldFillState(content, section, field.targetField)
  );
  if (states.every((state) => state === "empty")) return "empty";
  if (states.some((state) => state === "filled")) return "filled";
  return "partial";
}

/**
 * Chat-oriented field read: anchor `text` plus `readingText` with `[image:N]`
 * markers, appending vision payloads into `collected` (shared across fields).
 */
export function sectionFieldForChat(
  sectionContent: Record<string, unknown>,
  section: SectionType,
  targetField: string,
  collected: SectionInlineImage[]
): {
  text: string;
  readingText: string;
  imageCount: number;
  /** Coordinate-tagged view for table/list fields (present only when useful). */
  structuredText?: string;
  /** Existing tables in this field (present only when the field has one). */
  tables?: Array<{
    tableIndex: number;
    headers: string[];
    dataRowCount: number;
  }>;
} {
  if (!isRichTargetField(section, targetField)) {
    const text = getPlainTextFieldValue(sectionContent, targetField);
    return { text, readingText: text, imageCount: 0 };
  }
  const doc = getRichFieldValue(sectionContent, targetField);
  const text = flattenForAnchor(doc).text;
  const chat = flattenDocForChat(doc, {
    targetField,
    imageIndexStart: collected.length + 1,
    collected,
  });
  // Only surface the coordinate grid when the field actually has a table or
  // list (the renderer tags those with [row,col] / [index]).
  const structured = renderStructuredFieldView(doc);
  const structuredText = /\[\d+,\d+\]|\n\[\d+\] /.test(structured)
    ? structured
    : undefined;
  const tableInventory = summarizeTablesInDoc(doc).map(
    ({ tableIndex, headers, dataRowCount }) => ({
      tableIndex,
      headers,
      dataRowCount,
    })
  );
  return {
    text,
    readingText: chat.readingText,
    imageCount: chat.imageCount,
    structuredText,
    tables: tableInventory.length > 0 ? tableInventory : undefined,
  };
}

const ALL_DOCUMENT_TYPES: Record<DocumentType, true> = {
  investigation_report: true,
  design_verification: true,
  mechanical_design_verification: true,
  generic_document: true,
  quality_risk_assessment: true,
};

/** Human label for a section (registry, then shared map, then title-cased key). */
export function sectionLabel(section: SectionType): string {
  for (const type of Object.keys(ALL_DOCUMENT_TYPES) as DocumentType[]) {
    const match = getDocumentType(type).sections.find((s) => s.key === section);
    if (match) return match.label;
  }
  return displaySectionLabel(section);
}
