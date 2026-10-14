/**
 * Report-level statements an engineer typed in document chat.
 * A sentence is stored when it is not a question and not a bare
 * acknowledgement. Recognized equipment ids are not required.
 * The prompt receives the sentence only — never the author or the message id.
 */

import { splitSentences } from "@/lib/citations/citation-site";
import { extractHardFacts, type HardFact } from "@/lib/ai/chat/claim-facts";
import { isBareChatConfirmation } from "@/lib/ai/chat/citation-exemption";
import { CHAT_AUTO_CONTINUE_TEXT } from "@/lib/ai/chat/pending-plan";

export const STATED_FACTS_PER_MESSAGE = 20;
export const STATED_FACTS_PROMPT_CAP = 40;
const STATED_FACT_MESSAGE_CAP = 4_000;
const SOURCE_TEXT_CAP = 500;
const PROMPT_LINE_CAP = 400;
/** Skip "already in the report" for scraps that would match inside other words. */
const ALREADY_STATED_MIN = 24;

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const QUESTION_SENTENCE_RE = /\?\s*$/;
const ACK_SENTENCE_RE =
  /^(?:thanks|thank you|hi|hello|hey|done|noted|got it|cool|great)(?:\s*[!.]*)?$/i;
const INSERT_THAT_RE =
  /^(?:please\s+)?(?:insert|put|place|add)\s+(?:that|this|it)\b/i;

export type StatedFactRef = {
  /** English sentence injected into the prompt. */
  text: string;
  normalized: string;
};

export type StatedFactCandidate = StatedFactRef & {
  /** Sentence the engineer typed, in their language. */
  sourceText: string;
};

export function messageNeedsStatedFactTranslation(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

/**
 * English text to split into statements. Devanagari is translated first; a
 * failed translation stores nothing. `original` is the engineer's words.
 */
export async function englishTextForStatedFacts(
  text: string,
  translate: (text: string) => Promise<string | null>
): Promise<{ english: string; original: string | null } | null> {
  const capped = text.slice(0, STATED_FACT_MESSAGE_CAP);
  if (!messageNeedsStatedFactTranslation(capped)) {
    return { english: capped, original: null };
  }
  const translated = (await translate(capped))?.trim() ?? "";
  if (!translated || messageNeedsStatedFactTranslation(translated)) return null;
  return { english: translated, original: capped };
}

/**
 * One row per non-question sentence. "URS 3 ... 20 to 130 celsius" is kept
 * as that sentence. "yes", "insert that", and auto-continue are not.
 */
export function extractStatedFactCandidates(text: string): StatedFactCandidate[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  if (trimmed === CHAT_AUTO_CONTINUE_TEXT) return [];
  if (isBareChatConfirmation(text)) return [];

  const found: StatedFactCandidate[] = [];
  const seen = new Set<string>();
  for (const sentence of statementClauses(text)) {
    if (!sentence || QUESTION_SENTENCE_RE.test(sentence)) continue;
    if (
      isBareChatConfirmation(sentence) ||
      ACK_SENTENCE_RE.test(sentence) ||
      INSERT_THAT_RE.test(sentence)
    ) {
      continue;
    }
    const normalized = normalizeStatement(sentence);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    found.push({ text: sentence, normalized, sourceText: sentence });
    if (found.length >= STATED_FACTS_PER_MESSAGE) break;
  }
  return found;
}

/** Drop a sentence that is already written in the report. */
export function omitStatedFactsAlreadyInReport(
  candidates: readonly StatedFactCandidate[],
  haystack: string
): StatedFactCandidate[] {
  const hay = normalizeStatement(haystack);
  if (!hay) return [...candidates];
  return candidates.filter((candidate) => {
    if (candidate.normalized.length < ALREADY_STATED_MIN) return true;
    return !hay.includes(candidate.normalized);
  });
}

/**
 * Latest live rows the prompt and the citation keep-list share.
 * Older rows stay in the view.
 */
export function statedFactsForTurn(
  facts: readonly StatedFactRef[]
): StatedFactRef[] {
  if (facts.length <= STATED_FACTS_PROMPT_CAP) return [...facts];
  return facts.slice(facts.length - STATED_FACTS_PROMPT_CAP);
}

export function renderStatedFactsPrompt(facts: readonly StatedFactRef[]): string {
  if (facts.length === 0) return "";
  const lines = statedFactsForTurn(facts).map(
    (fact) => `- ${promptToken(fact.text)}`
  );
  return `## Engineer-stated facts
The engineer typed these statements on this report. They are not attachment evidence and they are not a reason to skip search. Do not invent a citation for them.
Use a statement when it bears on the answer, including when an attachment disagrees. Do not stretch a statement past what it says.
If this turn @-tags an attachment or names one on this report, and a retrieved page speaks to the same point, use the page instead of the statement.
${lines.join("\n")}`;
}

export function quotesForNamedAttachments(
  pages: readonly { id: string; quote: string }[],
  attachmentIds: readonly string[]
): string[] {
  if (attachmentIds.length === 0) return [];
  const ids = new Set(attachmentIds);
  return pages
    .filter((page) => ids.has(page.id) && page.quote.trim().length > 0)
    .map((page) => page.quote);
}

/**
 * Keep a drafted hard fact when a stored statement says that fact and the
 * draft is still about the same point. A named file whose served quote
 * shares that point wins for this turn.
 */
export function statedFactSupportsDraft(input: {
  fact: HardFact;
  draftContext: string;
  statedFacts: readonly StatedFactRef[];
  namedFileQuotes?: readonly string[];
}): boolean {
  if (input.statedFacts.length === 0) return false;
  const quotes = input.namedFileQuotes ?? [];
  for (const stated of input.statedFacts) {
    if (!statementSupportsFact(stated.text, input.fact)) continue;
    if (!statementAppliesToDraft(stated.text, input.draftContext)) continue;
    if (namedFilePreempts(stated.text, quotes)) continue;
    return true;
  }
  return false;
}

export function normalizeStatement(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!,:;]+$/g, "")
    .toLowerCase();
}

/** Segmenter leaves "…celsius. i think…" as one sentence when the next word is lowercase. */
function statementClauses(text: string): string[] {
  const clauses: string[] = [];
  for (const span of splitSentences(text)) {
    const sentence = text.slice(span.start, span.end);
    for (const part of sentence.split(/(?<=[.!?])\s+/)) {
      const clipped = clipSource(part);
      if (clipped) clauses.push(clipped);
    }
  }
  return clauses;
}

function clipSource(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().slice(0, SOURCE_TEXT_CAP);
}

function promptToken(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, PROMPT_LINE_CAP);
}

/** Spoken "URS 3" and "celsius" so a drafted °C range can match the sentence. */
function statementForFactMatch(sentence: string): string {
  return sentence
    .replace(/\b(?:degrees?\s+)?(?:celsius|centigrade)\b/gi, "°C")
    .replace(
      /\bURS(?:\s*[-–−]\s*|\s+)(\d+[a-z]?)\b/gi,
      (_all, num: string) => `URS-${num}`
    );
}

function temperatureKey(normalized: string): string {
  return normalized.replace(/c(?=to|[-–−]|$)/g, "").replace(/to|–|−/g, "-");
}

function factsMatch(stored: HardFact, drafted: HardFact): boolean {
  if (stored.kind !== drafted.kind) return false;
  if (stored.kind === "temperature") {
    return temperatureKey(stored.normalized) === temperatureKey(drafted.normalized);
  }
  if (stored.kind === "identifier") {
    return stored.normalized.toUpperCase() === drafted.normalized.toUpperCase();
  }
  return stored.normalized === drafted.normalized;
}

function statementFacts(text: string): HardFact[] {
  return extractHardFacts(statementForFactMatch(text));
}

function identifiersIn(text: string): string[] {
  return statementFacts(text)
    .filter((fact) => fact.kind === "identifier")
    .map((fact) => fact.normalized.toUpperCase());
}

function statementSupportsFact(statement: string, fact: HardFact): boolean {
  return statementFacts(statement).some((stored) => factsMatch(stored, fact));
}

/**
 * A statement that names URS-3 does not keep a number on a URS-14 draft.
 * A statement with no id can support its own numbers anywhere.
 */
function statementAppliesToDraft(statement: string, draftContext: string): boolean {
  const ids = identifiersIn(statement);
  if (ids.length === 0) return true;
  const draftIds = new Set(identifiersIn(draftContext));
  return ids.some((id) => draftIds.has(id));
}

function namedFilePreempts(
  statement: string,
  quotes: readonly string[]
): boolean {
  if (quotes.length === 0) return false;
  const ids = new Set(identifiersIn(statement));
  if (ids.size === 0) return false;
  return quotes.some((quote) => identifiersIn(quote).some((id) => ids.has(id)));
}
