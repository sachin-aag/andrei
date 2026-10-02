import {
  quoteWindowAroundKey,
  rowKeyFromContext,
} from "@/lib/ai/chat/qsr-row-grounding";
import type { RtmUrsPage } from "@/lib/ai/chat/rtm-draft-plan";

export type RtmIdentityRow = {
  ursId: string;
  parameters: string;
  userRequirement: string;
  citation: string;
};

function stripUrsPrefix(window: string, ursId: string): string {
  const needle = ursId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return window
    .replace(new RegExp(`^\\s*${needle}\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function citationFor(page: RtmUrsPage): string {
  return `[${page.filename}, p. ${page.pageNumber}]`;
}

/**
 * Copy the URS-N window remainder into Parameters / User requirements.
 * Column-major pages keep the gap label (MOC); prose pages keep the sentence.
 * Family columns stay out of this unit.
 */
export function identityFromUrsQuotes(input: {
  ursId: string;
  pages: readonly RtmUrsPage[];
}): RtmIdentityRow | null {
  const key = rowKeyFromContext(input.ursId) ?? input.ursId.trim().toUpperCase();
  if (!key) return null;
  for (const page of input.pages) {
    const window = quoteWindowAroundKey(page.quote, key);
    if (!window) continue;
    const rest = stripUrsPrefix(window, key);
    return {
      ursId: key,
      parameters: rest,
      userRequirement: rest,
      citation: citationFor(page),
    };
  }
  return null;
}

export function identityRowsForChecklist(input: {
  ursIds: readonly string[];
  pages: readonly RtmUrsPage[];
}): {
  rows: RtmIdentityRow[];
  notFound: string[];
} {
  const rows: RtmIdentityRow[] = [];
  const notFound: string[] = [];
  for (const id of input.ursIds) {
    const row = identityFromUrsQuotes({ ursId: id, pages: input.pages });
    if (!row) {
      notFound.push(id);
      continue;
    }
    rows.push(row);
  }
  return { rows, notFound };
}
