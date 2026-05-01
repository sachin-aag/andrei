import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";

/** Minimum sentences required in Define (first evaluatable section) before AI runs. */
export const MIN_SENTENCES_FIRST_SECTION = 2;

export const INSUFFICIENT_FIRST_SECTION_MESSAGE =
  "Add at least two sentences in the Define section before running the AI check. We need enough context to review your report.";

/**
 * Plain text from the Define section's narrative (TipTap JSON or legacy string).
 */
export function plainTextFromDefineSection(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content.trim();
  if (typeof content === "object" && content !== null && "narrative" in content) {
    const narrative = (content as { narrative?: unknown }).narrative;
    return richJsonToPlainText(normalizeRichField(narrative)).trim();
  }
  return "";
}

/**
 * Rough sentence count: splits on sentence-ending punctuation followed by space;
 * text with no `.` `!` `?` counts as one sentence if non-empty.
 */
export function countSentences(text: string): number {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return 0;
  const parts = t.split(/(?<=[.!?])\s+/).filter((p) => p.length > 0);
  return parts.length;
}

export function hasEnoughContextInFirstSection(content: unknown): boolean {
  return countSentences(plainTextFromDefineSection(content)) >= MIN_SENTENCES_FIRST_SECTION;
}
