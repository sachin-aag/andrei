import type { SectionType } from "@/db/schema";
import { SECTION_LABELS } from "@/types/sections";
import {
  SUGGEST_TARGET_FIELD_PATTERNS,
  isRichTargetField,
} from "@/lib/ai/suggest-target-fields";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

/** Sections the drafting chat can read + edit (DMAIC + conclusion). */
export const CHAT_EDITABLE_SECTIONS: readonly SectionType[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
];

/** `all` = no section filter; otherwise focus plan/edits on one section. */
export type ChatSectionScope = SectionType | "all";

export const CHAT_SECTION_SCOPE_ALL = "all" as const;

export function isChatEditableSection(value: string): value is SectionType {
  return (CHAT_EDITABLE_SECTIONS as readonly string[]).includes(value);
}

export function isChatSectionScope(value: unknown): value is ChatSectionScope {
  return value === CHAT_SECTION_SCOPE_ALL || isChatEditableSection(String(value));
}

export function parseChatSectionScope(value: unknown): ChatSectionScope {
  return isChatSectionScope(value) ? value : CHAT_SECTION_SCOPE_ALL;
}

/** Sections included in prompt/tools for the current focus. */
export function chatSectionsInScope(scope: ChatSectionScope): readonly SectionType[] {
  return scope === CHAT_SECTION_SCOPE_ALL ? CHAT_EDITABLE_SECTIONS : [scope];
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

/** Primary narrative field per section — used for summaries + stub drafting. */
export function primaryFieldForSection(section: SectionType): string {
  switch (section) {
    case "analyze":
      return "rootCause.narrative";
    case "control":
      return "preventiveActions";
    default:
      return "narrative";
  }
}

/** Current plain-text value of an in-section field (rich flattened to markdown). */
export function sectionFieldPlainText(
  sectionContent: Record<string, unknown>,
  section: SectionType,
  targetField: string
): string {
  if (isRichTargetField(section, targetField)) {
    return richJsonToPlainText(getRichFieldValue(sectionContent, targetField), {
      tableFormat: "markdown",
    });
  }
  return getPlainTextFieldValue(sectionContent, targetField);
}

/** Human label for a section (reuses the workspace labels). */
export function sectionLabel(section: SectionType): string {
  return SECTION_LABELS[section] ?? section;
}
