/**
 * Ask (plan) replies are not run through write grounding. After the stream,
 * drop [filename, p. N] that this turn never retrieved, or whose quote does
 * not contain the nearby hard fact, and replace unsourced hard facts with
 * placeholders. Do not fail the turn. Do not keep a cite because the number
 * is already in a read_section table — report-read numbers stay without the
 * fake file cite.
 */

import type { UIMessage } from "ai";
import { splitSentences } from "@/lib/citations/citation-site";
import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";
import {
  extractHardFacts,
  replaceFactsWithPlaceholders,
  stripCitationBrackets,
} from "@/lib/ai/chat/claim-facts";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  collectAskEvidence,
  evidenceFromLedger,
  factSupportedByQuote,
  shouldKeepAskFact,
  type LookupEvidence,
} from "@/lib/ai/chat/fact-support";
import {
  canonicalizeSourceCitationBracket,
  isSourceCitationBracket,
  parseSourceCitation,
  splitSourceCitationParts,
} from "@/lib/placeholders/citation-bracket";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

export const UNSOURCED_ASK_GROUNDING_NOTE =
  "Some values and page citations were removed because they were not on a page retrieved this turn or in a report section read this turn.";

/** @deprecated Use UNSOURCED_ASK_GROUNDING_NOTE */
export const UNSOURCED_ASK_CITATION_NOTE = UNSOURCED_ASK_GROUNDING_NOTE;

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
      const supported = nearby.every((fact) => factSupportedByQuote(quote, fact));
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

function rewriteAskCitationText(
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
  return { text: tidied, dropped: tidied !== text };
}

function placeholderUnsupportedAskFacts(
  original: string,
  cited: string,
  evidence: LookupEvidence
): { text: string; placeholdered: boolean } {
  const originalDrops = new Set(
    extractHardFacts(original)
      .filter((fact) => !shouldKeepAskFact(fact, evidence))
      .map((fact) => `${fact.kind}:${fact.normalized}`)
  );
  if (originalDrops.size === 0) return { text: cited, placeholdered: false };
  const toPlaceholder = extractHardFacts(cited).filter((fact) =>
    originalDrops.has(`${fact.kind}:${fact.normalized}`)
  );
  if (toPlaceholder.length === 0) return { text: cited, placeholdered: false };
  return {
    text: replaceFactsWithPlaceholders(cited, toPlaceholder),
    placeholdered: true,
  };
}

function appendGroundingNote(text: string): string {
  if (text.includes(UNSOURCED_ASK_GROUNDING_NOTE)) return text;
  return `${text.trimEnd()}\n\n${UNSOURCED_ASK_GROUNDING_NOTE}`;
}

export function rewriteUnsourcedAskCitations(
  text: string,
  ledger: CitationPageLedger,
  extras?: { reportHaystack?: string; userHaystack?: string }
): { text: string; dropped: boolean } {
  if (!text.trim()) return { text, dropped: false };
  const cited = rewriteAskCitationText(text, ledger);
  const grounded = placeholderUnsupportedAskFacts(
    text,
    cited.text,
    evidenceFromLedger(ledger, extras)
  );
  if (!cited.dropped && !grounded.placeholdered) {
    return { text, dropped: false };
  }
  return { text: appendGroundingNote(grounded.text), dropped: true };
}

function rewriteAskTextWithEvidence(
  text: string,
  ledger: CitationPageLedger,
  evidence: LookupEvidence
): { text: string; dropped: boolean } {
  if (!text.trim()) return { text, dropped: false };
  const cited = rewriteAskCitationText(text, ledger);
  const grounded = placeholderUnsupportedAskFacts(text, cited.text, evidence);
  if (!cited.dropped && !grounded.placeholdered) {
    return { text, dropped: false };
  }
  return { text: appendGroundingNote(grounded.text), dropped: true };
}

export function rewriteAskCitationParts(
  parts: UIMessage["parts"],
  ledger: CitationPageLedger,
  extras?: { reportHaystack?: string; userHaystack?: string }
): UIMessage["parts"] {
  let dropped = false;
  const next = parts.map((part) => {
    if (part.type !== "text") return part;
    const text = typeof part.text === "string" ? part.text : "";
    const rewritten = rewriteUnsourcedAskCitations(text, ledger, extras);
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
  const messages = [...input.history, input.response];
  const ledger = new CitationPageLedger();
  ledger.seedFromMessages(messages);
  const evidence = collectAskEvidence({ messages, ledger });
  let dropped = false;
  const next = input.parts.map((part) => {
    if (part.type !== "text") return part;
    const text = typeof part.text === "string" ? part.text : "";
    const rewritten = rewriteAskTextWithEvidence(text, ledger, evidence);
    if (!rewritten.dropped) return part;
    dropped = true;
    return { ...part, text: rewritten.text };
  });
  if (!dropped) return input.parts;
  return next;
}
