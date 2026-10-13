/**
 * Report-level facts an engineer typed in document chat. A quantity is kept
 * only with the identifier in the same sentence, so one vessel's temperature
 * cannot fill another. Bare confirmations and question sentences are ignored.
 * The prompt receives the pair only — never the surrounding sentence, the
 * author, or the message id.
 */

import { splitSentences } from "@/lib/citations/citation-site";
import {
  extractHardFacts,
  type HardFact,
  type HardFactKind,
} from "@/lib/ai/chat/claim-facts";
import { isBareChatConfirmation } from "@/lib/ai/chat/citation-exemption";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import { CHAT_AUTO_CONTINUE_TEXT } from "@/lib/ai/chat/pending-plan";

export const STATED_FACTS_PER_MESSAGE = 20;
export const STATED_FACTS_PROMPT_CAP = 40;
const STATED_FACT_MESSAGE_CAP = 4_000;
const SOURCE_TEXT_CAP = 500;

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const QUESTION_SENTENCE_RE = /\?\s*$/;

/**
 * Label immediately before an identifier assigns it to this report
 * ("batch is MF-25-VIAL-01", "document no. SOP/QA/017").
 */
const IDENTIFIER_ASSIGN_BEFORE_RE =
  /\b(?:batch|lot)\s*(?:no\.?|number|#)?\s*(?:is|was|are|=|:)\s*$|\bdocument\s*(?:no\.?|number|#)\s*(?:is|was|are|=|:)?\s*$|\b(?:is|was|=)\s*$/i;

export type StatedFactRef = {
  entityText: string;
  entityNormalized: string;
  valueText: string;
  valueKind: HardFactKind;
  valueNormalized: string;
};

export type StatedFactCandidate = StatedFactRef & {
  sourceText: string;
};

export function messageNeedsStatedFactTranslation(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

/**
 * English text to extract from. Devanagari is translated first; a failed
 * translation stores nothing. `original` is the engineer's words for the view.
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

export function extractStatedFactCandidates(text: string): StatedFactCandidate[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  if (trimmed === CHAT_AUTO_CONTINUE_TEXT) return [];
  if (isBareChatConfirmation(text)) return [];

  const sentences = splitSentences(text);
  const found: StatedFactCandidate[] = [];
  for (const span of sentences) {
    const sentence = text.slice(span.start, span.end);
    if (QUESTION_SENTENCE_RE.test(sentence.trim())) continue;
    const extracted = sentenceForStatedFactExtract(sentence);
    const facts = extractHardFacts(extracted);
    const identifiers = facts.filter((fact) => fact.kind === "identifier");
    const quantities = facts.filter((fact) => fact.kind !== "identifier");
    if (quantities.length > 0 && identifiers.length > 0) {
      for (const identifier of identifiers) {
        for (const quantity of quantities) {
          found.push(candidateFrom(identifier, quantity, sentence));
        }
      }
      continue;
    }
    if (quantities.length > 0) continue;
    for (const identifier of identifiers) {
      const before = extracted.slice(
        Math.max(0, identifier.start - 48),
        identifier.start
      );
      if (!IDENTIFIER_ASSIGN_BEFORE_RE.test(before)) continue;
      found.push({
        entityText: "",
        entityNormalized: "",
        valueText: identifier.text.trim(),
        valueKind: "identifier",
        valueNormalized: identifier.normalized,
        sourceText: clipSource(sentence),
      });
    }
  }

  const seen = new Set<string>();
  const unique: StatedFactCandidate[] = [];
  for (const row of found) {
    const key = `${row.entityNormalized}\0${row.valueKind}\0${row.valueNormalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= STATED_FACTS_PER_MESSAGE) break;
  }
  return unique;
}

/**
 * Spoken ids and units the hard-fact extractor misses: "URS 3", "celsius".
 * The stored pair uses the rewritten form (`URS-3`, `20 to 130 °C`). The
 * view still shows the engineer's original sentence.
 */
function sentenceForStatedFactExtract(sentence: string): string {
  return sentence
    .replace(/\b(?:degrees?\s+)?(?:celsius|centigrade)\b/gi, "°C")
    .replace(
      /\bURS(?:\s*[-–−]\s*|\s+)(\d+[a-z]?)\b/gi,
      (_all, num: string) => `URS-${num}`
    );
}

/** "20 to 130 °C" and "20 °C to 130 °C" are the same range. */
function temperatureKey(normalized: string): string {
  return normalized.replace(/c(?=to|[-–−]|$)/g, "").replace(/to|–|−/g, "-");
}

/** Exact id, so URS-3 does not bind URS-14 or URS-30. Spoken "URS 3" counts. */
function contextNamesEntity(text: string, entityNormalized: string): boolean {
  if (!entityNormalized) return false;
  const hay = text
    .toUpperCase()
    .replace(/\bURS(?:\s*[-–−]\s*|\s+)(\d+[A-Z]?)\b/g, "URS-$1");
  const needle = entityNormalized
    .toUpperCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Z0-9])${needle}(?![A-Z0-9])`).test(hay);
}

function sameIdentifier(stored: string, drafted: string): boolean {
  return stored.toUpperCase() === drafted.toUpperCase();
}

function sameStatedValue(stated: StatedFactRef, fact: HardFact): boolean {
  if (stated.valueKind !== fact.kind) return false;
  if (fact.kind === "temperature") {
    return temperatureKey(stated.valueNormalized) === temperatureKey(fact.normalized);
  }
  return stated.valueNormalized === fact.normalized;
}

function candidateFrom(
  identifier: HardFact,
  quantity: HardFact,
  sentence: string
): StatedFactCandidate {
  return {
    entityText: identifier.text.trim(),
    entityNormalized: identifier.normalized,
    valueText: quantity.text.trim(),
    valueKind: quantity.kind,
    valueNormalized: quantity.normalized,
    sourceText: clipSource(sentence),
  };
}

function clipSource(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().slice(0, SOURCE_TEXT_CAP);
}

function asExtractedFact(
  text: string,
  kind: HardFactKind,
  normalized: string
): HardFact | null {
  return (
    extractHardFacts(text).find(
      (fact) => fact.kind === kind && fact.normalized === normalized
    ) ?? null
  );
}

/** Drop a candidate whose entity and value are already in the report. */
export function omitStatedFactsAlreadyInReport(
  candidates: readonly StatedFactCandidate[],
  haystack: string
): StatedFactCandidate[] {
  if (!haystack.trim()) return [...candidates];
  return candidates.filter((candidate) => !candidateAlreadyInReport(candidate, haystack));
}

function candidateAlreadyInReport(
  candidate: StatedFactCandidate,
  haystack: string
): boolean {
  const value = asExtractedFact(
    candidate.valueText,
    candidate.valueKind,
    candidate.valueNormalized
  );
  if (!value || !evidenceContainsFact(haystack, value)) return false;
  if (!candidate.entityNormalized) return true;
  const entity = asExtractedFact(
    candidate.entityText,
    "identifier",
    candidate.entityNormalized
  );
  return Boolean(entity && evidenceContainsFact(haystack, entity));
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
  const lines = statedFactsForTurn(facts).map((fact) => {
    const value = promptToken(fact.valueText);
    const entity = promptToken(fact.entityText);
    return entity ? `- ${entity}: ${value}` : `- ${value}`;
  });
  return `## Engineer-stated facts
These values were typed by an engineer on this report. They are not attachment evidence and they are not a reason to skip search. Do not invent a citation for them.
Use the engineer-stated value for that same entity, including when an attachment states a different value.
If this turn @-tags an attachment or names one on this report, and a retrieved page from that file speaks to the same entity, use the page instead of the stated fact.
Do not apply a stated value to a different entity.
${lines.join("\n")}`;
}

function promptToken(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
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
 * Keep a drafted hard fact only when a stored pair matches that exact value
 * and the draft also names the same identifier. A named file whose served
 * quote mentions the entity wins for this turn.
 */
export function statedFactSupportsDraft(input: {
  fact: HardFact;
  draftContext: string;
  statedFacts: readonly StatedFactRef[];
  namedFileQuotes?: readonly string[];
}): boolean {
  if (input.statedFacts.length === 0) return false;
  if (
    input.fact.kind === "identifier" &&
    statedEntityInDraft(input.fact, input.draftContext, input.statedFacts, input.namedFileQuotes ?? [])
  ) {
    return true;
  }
  for (const stated of input.statedFacts) {
    if (!sameStatedValue(stated, input.fact)) continue;
    if (stated.entityNormalized) {
      if (!contextNamesEntity(input.draftContext, stated.entityNormalized)) {
        continue;
      }
      const named = input.namedFileQuotes ?? [];
      if (named.some((quote) => contextNamesEntity(quote, stated.entityNormalized))) {
        continue;
      }
    } else if (namedQuoteMentionsValue(input.namedFileQuotes ?? [], input.fact)) {
      continue;
    }
    return true;
  }
  return false;
}

/** The binding identifier stays when the draft also contains that pair's value. */
function statedEntityInDraft(
  fact: HardFact,
  draftContext: string,
  statedFacts: readonly StatedFactRef[],
  namedFileQuotes: readonly string[]
): boolean {
  for (const stated of statedFacts) {
    if (
      !stated.entityNormalized ||
      !sameIdentifier(stated.entityNormalized, fact.normalized)
    ) {
      continue;
    }
    const value = asExtractedFact(
      stated.valueText,
      stated.valueKind,
      stated.valueNormalized
    );
    if (!value || !evidenceContainsFact(draftContext, value)) continue;
    if (namedFileQuotes.some((quote) => contextNamesEntity(quote, stated.entityNormalized))) {
      continue;
    }
    return true;
  }
  return false;
}

function namedQuoteMentionsValue(
  quotes: readonly string[],
  fact: HardFact
): boolean {
  return quotes.some((quote) => evidenceContainsFact(quote, fact));
}
