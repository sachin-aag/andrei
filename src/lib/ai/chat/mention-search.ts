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
  /** Extra search tokens (folder path) that are not inserted into the text. */
  keywords?: string;
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

function candidateSearchText(candidate: MentionCandidate): {
  label: string;
  extra: string;
} {
  return {
    label: candidate.label.toLowerCase(),
    extra: (candidate.keywords ?? "").toLowerCase(),
  };
}

/**
 * Prefix matches first, then substring matches; both case-insensitive.
 * No default cap — the @ menu must list every section/sheet, not a slice.
 */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit?: number
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  const ranked = (() => {
    if (!needle) return candidates;
    const prefix: MentionCandidate[] = [];
    const contains: MentionCandidate[] = [];
    for (const candidate of candidates) {
      const { label, extra } = candidateSearchText(candidate);
      if (label.startsWith(needle)) prefix.push(candidate);
      else if (label.includes(needle) || extra.includes(needle)) {
        contains.push(candidate);
      }
    }
    return [...prefix, ...contains];
  })();
  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
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

/** Refresh chip labels when the underlying sheet/plot/document was renamed. */
export function syncMentionCandidateLabels(
  mentions: MentionCandidate[],
  candidates: MentionCandidate[]
): MentionCandidate[] {
  if (mentions.length === 0) return mentions;

  const byKey = new Map(
    candidates.map((candidate) => [
      mentionKey(candidate.type, candidate.id),
      candidate,
    ])
  );
  let changed = false;
  const next = mentions.map((mention) => {
    const fresh = byKey.get(mentionKey(mention.type, mention.id));
    if (
      !fresh ||
      (fresh.label === mention.label && fresh.sublabel === mention.sublabel)
    ) {
      return mention;
    }
    changed = true;
    return { ...mention, label: fresh.label, sublabel: fresh.sublabel };
  });
  return changed ? next : mentions;
}
