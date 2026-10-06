/**
 * Ask (plan) replies are not run through write grounding. After the stream,
 * drop [filename, p. N] that this turn never retrieved, or whose quote does
 * not contain the nearby hard fact. Do not fail the turn. Do not keep a cite
 * because the number is already in a read_section table.
 */

import type { UIMessage } from "ai";
import { splitSentences } from "@/lib/citations/citation-site";
import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";
import {
  extractHardFacts,
  stripCitationBrackets,
} from "@/lib/ai/chat/claim-facts";
import {
  CitationPageLedger,
} from "@/lib/ai/chat/citation-grounding";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import {
  canonicalizeSourceCitationBracket,
  isSourceCitationBracket,
  parseSourceCitation,
  splitSourceCitationParts,
} from "@/lib/placeholders/citation-bracket";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

export const UNSOURCED_ASK_CITATION_NOTE =
  "Some page citations were removed because those pages were not retrieved this turn, or the retrieved quote does not contain that fact.";

const BRACKET_RE = /\[[^\]]+\]/g;

function sentenceAround(text: string, start: number, end: number): string {
  for (const span of splitSentences(text)) {
    if (start >= span.start && start < span.end) {
      return text.slice(span.start, span.end);
    }
  }
  return text.slice(Math.max(0, start - 80), Math.min(text.length, end + 80));
}

function tidyDroppedCitations(original: string, rewritten: string): string {
  if (rewritten === original) return rewritten;
  return rewritten
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\( +\)/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function nearbyFacts(text: string, start: number, end: number) {
  return extractHardFacts(stripCitationBrackets(sentenceAround(text, start, end)));
}

function rewriteAskCitationPart(
  part: string,
  ledger: CitationPageLedger,
  nearby: ReturnType<typeof nearbyFacts>
): string {
  const parsed = parseSourceCitation(`[${part}]`, ledger.recordedFilenames());
  if (!parsed) return part;
  const attachmentLike = hasSupportedAttachmentExtension(parsed.filename);
  if (parsed.pages.length === 0) {
    if (!attachmentLike) return part;
    if (!ledger.hasRecordedPages()) return "";
    if (ledger.decision(parsed.filename, 1) === "unknown") return "";
    return part;
  }
  const kept: number[] = [];
  for (const page of parsed.pages) {
    if (ledger.decision(parsed.filename, page) !== "keep") continue;
    const evidence = ledger.pageEvidence(parsed.filename, page);
    const quote = evidence?.quote.trim() ?? "";
    if (quote && nearby.length > 0) {
      const supported = nearby.every((fact) =>
        evidenceContainsFact(quote, fact)
      );
      if (!supported) continue;
    }
    kept.push(page);
  }
  if (kept.length === 0) {
    if (!attachmentLike) return part;
    return "";
  }
  return `${parsed.filename}, p. ${kept.join(", ")}`;
}

function rewriteAskCitationBracket(
  match: string,
  ledger: CitationPageLedger,
  nearby: ReturnType<typeof nearbyFacts>
): string {
  const inner = match.slice(1, -1);
  const parts = splitSourceCitationParts(inner, ledger.recordedFilenames());
  if (parts.length === 0) return match;
  const rewritten = parts
    .map((part) => rewriteAskCitationPart(part, ledger, nearby))
    .filter((part) => part.trim().length > 0);
  if (rewritten.length === 0) return "";
  return canonicalizeSourceCitationBracket(
    `[${rewritten.join(", ")}]`,
    ledger.recordedFilenames()
  );
}

export function rewriteUnsourcedAskCitations(
  text: string,
  ledger: CitationPageLedger
): { text: string; dropped: boolean } {
  if (!text.trim()) return { text, dropped: false };
  BRACKET_RE.lastIndex = 0;
  const rewritten = text.replace(BRACKET_RE, (match, offset: number) => {
    if (!isSourceCitationBracket(match)) return match;
    const nearby = nearbyFacts(text, offset, offset + match.length);
    return rewriteAskCitationBracket(match, ledger, nearby);
  });
  const tidied = tidyDroppedCitations(text, rewritten);
  if (tidied === text) return { text, dropped: false };
  if (tidied.includes(UNSOURCED_ASK_CITATION_NOTE)) {
    return { text: tidied, dropped: true };
  }
  const withNote = `${tidied.trimEnd()}\n\n${UNSOURCED_ASK_CITATION_NOTE}`;
  return { text: withNote, dropped: true };
}

export function rewriteAskCitationParts(
  parts: UIMessage["parts"],
  ledger: CitationPageLedger
): UIMessage["parts"] {
  let dropped = false;
  const next = parts.map((part) => {
    if (part.type !== "text") return part;
    const text = typeof part.text === "string" ? part.text : "";
    const rewritten = rewriteUnsourcedAskCitations(text, ledger);
    if (!rewritten.dropped) return part;
    dropped = true;
    return { ...part, text: rewritten.text };
  });
  if (!dropped) return parts;
  return next;
}

export function rewriteAskAssistantParts(input: {
  mode: ChatMode;
  parts: UIMessage["parts"];
  history: readonly UIMessage[];
  response: UIMessage;
}): UIMessage["parts"] {
  if (input.mode !== "plan") return input.parts;
  const ledger = new CitationPageLedger();
  ledger.seedFromMessages([...input.history, input.response]);
  return rewriteAskCitationParts(input.parts, ledger);
}
