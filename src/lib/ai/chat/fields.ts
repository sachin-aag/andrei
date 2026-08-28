import type { DocumentType, SectionType } from "@/db/schema";
import { SECTION_LABELS } from "@/types/sections";
import {
  SUGGEST_TARGET_FIELD_PATTERNS,
  isRichTargetField,
} from "@/lib/ai/suggest-target-fields";
import { getDocumentType, listDocumentTypes } from "@/lib/document-types";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { renderStructuredFieldView } from "@/lib/ai/suggestion-section-context";
import {
  countImagesInDoc,
  flattenDocForChat,
  type SectionInlineImage,
} from "@/lib/ai/chat/section-images";

/** Sections the drafting chat can read + edit (DMAIC + conclusion). */
export const CHAT_EDITABLE_SECTIONS: readonly SectionType[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
];

export function chatEditableSections(
  documentType: DocumentType = "investigation_report"
): readonly SectionType[] {
  return getDocumentType(documentType)
    .sections.filter((s) => s.editable && !s.virtual)
    .map((s) => s.key);
}

/** `all` = no section filter; otherwise focus plan/edits on one section. */
export type ChatSectionScope = SectionType | "all";

export const CHAT_SECTION_SCOPE_ALL = "all" as const;

export function isChatEditableSection(
  value: string,
  documentType: DocumentType = "investigation_report"
): value is SectionType {
  return (chatEditableSections(documentType) as readonly string[]).includes(value);
}

export function isChatSectionScope(
  value: unknown,
  documentType: DocumentType = "investigation_report"
): value is ChatSectionScope {
  return (
    value === CHAT_SECTION_SCOPE_ALL ||
    isChatEditableSection(String(value), documentType)
  );
}

export function parseChatSectionScope(
  value: unknown,
  documentType: DocumentType = "investigation_report"
): ChatSectionScope {
  return isChatSectionScope(value, documentType)
    ? value
    : CHAT_SECTION_SCOPE_ALL;
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

/** Below this character count (and no images) a section is "partial", not empty. */
export const SECTION_PARTIAL_CHAR_LIMIT = 120;

export type SectionFillState = "empty" | "partial" | "filled";

export function sectionFillState(
  content: Record<string, unknown> | undefined,
  section: SectionType
): SectionFillState {
  const primary = primaryFieldForSection(section);
  const text = sectionFieldPlainText(content ?? {}, section, primary);
  const charCount = text.replace(/\s+/g, " ").trim().length;
  const imageCount = countSectionInlineImages(content ?? {}, section);
  if (charCount === 0 && imageCount === 0) return "empty";
  if (charCount < SECTION_PARTIAL_CHAR_LIMIT && imageCount === 0) {
    return "partial";
  }
  return "filled";
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
  return {
    text,
    readingText: chat.readingText,
    imageCount: chat.imageCount,
    structuredText,
  };
}

/** Human label for a section (workspace labels, then any registered document type). */
export function sectionLabel(section: SectionType): string {
  for (const def of listDocumentTypes()) {
    const match = def.sections.find((s) => s.key === section);
    if (match) return match.label;
  }
  return SECTION_LABELS[section] ?? section;
}
