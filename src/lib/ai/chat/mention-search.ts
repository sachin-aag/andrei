import type { SectionType } from "@/db/schema";
import type { ChatMentionType } from "@/lib/ai/chat/mentions";

/** Max characters between `@` and the caret before the menu gives up. */
const MAX_MENTION_QUERY_CHARS = 60;

export type MentionCandidate = {
  type: ChatMentionType | string;
  /** Attachment id, section type, sheet id, or analysis id. */
  id: string;
  /** Filename or section name — inserted into the text for the engineer. */
  label: string;
  /** Short secondary line (page count, user description). */
  sublabel?: string;
};

export type MentionQuery = {
  query: string;
  /** Index of the `@`. */
  start: number;
  /** Caret index (exclusive end of the replaced range). */
  end: number;
};

/**
 * Locate the `@…` token the caret sits in. The token must start the word, and
 * may contain spaces so multi-word filenames stay searchable.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const position = Math.max(0, Math.min(caret, text.length));
  const upToCaret = text.slice(0, position);
  const start = upToCaret.lastIndexOf("@");
  if (start === -1) return null;

  const charBefore = start === 0 ? "" : upToCaret[start - 1]!;
  if (charBefore && !/\s/.test(charBefore)) return null;

  const query = upToCaret.slice(start + 1);
  if (query.length > MAX_MENTION_QUERY_CHARS) return null;
  if (/[\n\r]/.test(query)) return null;

  return { query, start, end: position };
}

/** Prefix matches first, then substring matches; both case-insensitive. */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 8
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return candidates.slice(0, limit);

  const prefix: MentionCandidate[] = [];
  const contains: MentionCandidate[] = [];
  for (const candidate of candidates) {
    const haystack = candidate.label.toLowerCase();
    if (haystack.startsWith(needle)) prefix.push(candidate);
    else if (haystack.includes(needle)) contains.push(candidate);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/**
 * Replace the in-progress `@…` token with the chosen label. The label is for
 * the engineer and the model to read — the mention id sent to the API stays
 * authoritative, so editing this text cannot retarget the mention.
 */
export function applyMentionToInput(
  text: string,
  range: MentionQuery,
  candidate: MentionCandidate
): { text: string; caret: number } {
  const inserted = `@${candidate.label} `;
  const next = text.slice(0, range.start) + inserted + text.slice(range.end);
  return { text: next, caret: range.start + inserted.length };
}

export function mentionKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export function sectionMentionCandidate(
  section: SectionType,
  label: string
): MentionCandidate {
  return { type: "section", id: section, label };
}
