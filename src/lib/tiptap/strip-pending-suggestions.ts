import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import { isRecord } from "@/lib/ai/section-context";
import { stripSuggestionMarksFromDoc } from "@/lib/tiptap/rich-text";

/**
 * Returns section content with pending AI suggestion marks removed so the
 * evaluator (and content-hash for freshness) only see approved / accepted text.
 */
export function cleanSectionContentForEval(
  section: SectionType,
  content: unknown
): unknown {
  if (!isRecord(content)) return content;
  const next = { ...content } as Record<string, unknown>;

  if (
    (section === "define" || section === "measure" || section === "improve") &&
    next.narrative &&
    typeof next.narrative === "object" &&
    (next.narrative as JSONContent).type === "doc"
  ) {
    next.narrative = stripSuggestionMarksFromDoc(next.narrative as JSONContent);
  }

  return next;
}

/** Strip pending marks from a single Tiptap doc (e.g. narrative field). */
export function cleanViewForPrompt(doc: JSONContent): JSONContent {
  return stripSuggestionMarksFromDoc(doc);
}
