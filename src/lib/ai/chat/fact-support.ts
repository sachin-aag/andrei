/**
 * Shared fact matcher for Agent writes and Ask persist.
 * Quote / haystack matching is one function; Agent still owns citation
 * moves, QSR row windows, and fail-closed in groundDraftText.
 */

import type { UIMessage } from "ai";
import type { HardFact } from "@/lib/ai/chat/claim-facts";
import {
  CitationPageLedger,
  toolNameFromPart,
  toolOutputFromPart,
  unwrapToolOutput,
} from "@/lib/ai/chat/citation-grounding";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import { latestUserMessageText } from "@/lib/ai/chat/insert-image";
import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";
import {
  CALCULATE_TOOL_NAME,
  calculationEvidenceFromToolOutput,
  calculationSupportingFact,
  type CalculationEvidence,
} from "@/lib/ai/chat/calculate";

const REPORT_LOOKUP_TOOLS = new Set(["read_section", "read_worksheet"]);
const ATTACHMENT_EXTRACT_TOOLS = new Set([
  "extract_numeric_series",
  "extract_sheet",
]);

export type LookupEvidence = {
  /** Retrieved attachment quotes (ledger pages + extract tools). */
  quotes: readonly string[];
  /** Live report / worksheet text this conversation actually read. */
  reportHaystack: string;
  /** Latest user message — engineer-stated facts. */
  userHaystack: string;
  /** This-turn `calculate` products (not operands). */
  calculations?: readonly CalculationEvidence[];
};

export type LookupFactSupport =
  | "quote"
  | "report"
  | "user"
  | "computed"
  | "none";

/** True when served page / extract text supports this hard fact. */
export function factSupportedByQuote(quote: string, fact: HardFact): boolean {
  return evidenceContainsFact(quote, fact);
}

/** True when live report, worksheet, or user text supports this hard fact. */
export function factSupportedByHaystack(
  haystack: string,
  fact: HardFact
): boolean {
  return Boolean(haystack.trim()) && evidenceContainsFact(haystack, fact);
}

export function attachmentQuotesSupportFact(
  quotes: readonly string[],
  fact: HardFact
): boolean {
  return quotes.some((quote) => factSupportedByQuote(quote, fact));
}

/**
 * Prefer attachment quotes, then the engineer's message, then a section
 * this turn actually read. Prior assistant chat is not a source.
 */
export function classifyLookupFactSupport(
  fact: HardFact,
  evidence: LookupEvidence
): LookupFactSupport {
  if (attachmentQuotesSupportFact(evidence.quotes, fact)) return "quote";
  if (factSupportedByHaystack(evidence.userHaystack, fact)) return "user";
  if (factSupportedByHaystack(evidence.reportHaystack, fact)) return "report";
  if (calculationSupportingFact(fact, evidence.calculations ?? [])) {
    return "computed";
  }
  return "none";
}

export function factHasAttachmentCite(fact: HardFact): boolean {
  return fact.cited.some((cite) =>
    hasSupportedAttachmentExtension(cite.filename)
  );
}

export function lookupEvidenceWasCollected(evidence: LookupEvidence): boolean {
  if (evidence.reportHaystack.trim()) return true;
  if ((evidence.calculations ?? []).length > 0) return true;
  return evidence.quotes.some((quote) => quote.trim().length > 0);
}

/**
 * Ask persist: keep facts the lookup supports. Report-read numbers stay
 * even with a fake file cite (the cite is dropped separately). Attachment
 * cites or a lookup this turn still replace an invented number.
 * Empty lookup fail-opens, matching Agent writes.
 */
export function shouldKeepAskFact(
  fact: HardFact,
  evidence: LookupEvidence
): boolean {
  const support = classifyLookupFactSupport(fact, evidence);
  if (
    support === "quote" ||
    support === "user" ||
    support === "report" ||
    support === "computed"
  ) {
    return true;
  }
  if (factHasAttachmentCite(fact)) return false;
  if (lookupEvidenceWasCollected(evidence)) return false;
  return true;
}

export function collectAskEvidence(input: {
  messages: readonly UIMessage[];
  ledger: CitationPageLedger;
  userHaystack?: string;
}): LookupEvidence {
  const quotes: string[] = [];
  for (const page of input.ledger.recordedPages()) {
    if (page.quote.trim()) quotes.push(page.quote);
  }
  const reportParts: string[] = [];
  const calculations: CalculationEvidence[] = [];
  for (const message of input.messages) {
    for (const part of message.parts ?? []) {
      const name = toolNameFromPart(part);
      if (!name) continue;
      const output = toolOutputFromPart(part);
      if (name === CALCULATE_TOOL_NAME) {
        calculations.push(
          ...calculationEvidenceFromToolOutput(unwrapToolOutput(output))
        );
        continue;
      }
      if (REPORT_LOOKUP_TOOLS.has(name)) {
        reportParts.push(...stringsFromReportLookup(output));
        continue;
      }
      if (ATTACHMENT_EXTRACT_TOOLS.has(name)) {
        quotes.push(...stringsFromExtractLookup(output));
      }
    }
  }
  return {
    quotes,
    reportHaystack: reportParts.join("\n"),
    userHaystack:
      input.userHaystack ?? latestUserMessageText(input.messages),
    calculations,
  };
}

function stringsFromReportLookup(output: unknown): string[] {
  const root = unwrapToolOutput(output);
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];
  const rec = root as Record<string, unknown>;
  const pieces: string[] = [];
  if (Array.isArray(rec.fields)) {
    for (const field of rec.fields) {
      if (!field || typeof field !== "object" || Array.isArray(field)) continue;
      const row = field as Record<string, unknown>;
      for (const key of ["text", "readingText", "structuredText", "value"]) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) pieces.push(value);
      }
    }
  }
  if (pieces.length > 0) return pieces;
  try {
    const dumped = JSON.stringify(root);
    return dumped && dumped !== "{}" ? [dumped] : [];
  } catch {
    return [];
  }
}

function stringsFromExtractLookup(output: unknown): string[] {
  const root = unwrapToolOutput(output);
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];
  const rec = root as Record<string, unknown>;
  const pieces: string[] = [];
  if (Array.isArray(rec.values)) {
    pieces.push(rec.values.map(String).join(" "));
  }
  if (Array.isArray(rec.dates)) {
    pieces.push(rec.dates.map(String).join(" "));
  }
  if (Array.isArray(rec.rows)) {
    try {
      pieces.push(JSON.stringify(rec.rows));
    } catch {
      /* ignore */
    }
  }
  for (const key of ["text", "quote", "snippet"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) pieces.push(value);
  }
  return pieces;
}

export function evidenceFromLedger(
  ledger: CitationPageLedger,
  extras?: { reportHaystack?: string; userHaystack?: string }
): LookupEvidence {
  return {
    quotes: ledger
      .recordedPages()
      .map((page) => page.quote)
      .filter((quote) => quote.trim().length > 0),
    reportHaystack: extras?.reportHaystack ?? "",
    userHaystack: extras?.userHaystack ?? "",
    calculations: [],
  };
}
