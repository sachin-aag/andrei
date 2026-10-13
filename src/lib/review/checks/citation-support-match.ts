import type { JSONContent } from "@tiptap/core";
import { extractHardFacts, type HardFact } from "@/lib/ai/chat/claim-facts";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import { splitSentences } from "@/lib/citations/citation-site";
import { flattenForAnchor } from "@/lib/suggestions/locator";

const SUBJECT_FAMILY =
  "vessel|reactor|equipment|unit|system|loop|jacket|shell|train|batch|sample|location|tank|line|skid|filter|column|chamber|pump|motor";

const SUBJECT_RE = new RegExp(
  String.raw`\b(${SUBJECT_FAMILY})\s*[#:]?\s*([A-Z]{1,3}\d{0,4}|\d{1,4}[A-Z]{0,2})(?![-–−]\d)\b`,
  "gi"
);

/** Compact equipment / protocol IDs that claim-facts does not always extract. */
const EQUIPMENT_ID_RE = /\b[A-Z]{2,8}[-/]\d{3,6}[A-Za-z]?\b/g;

export type ContextLabel = {
  family: string;
  value: string;
  text: string;
};

export type ClaimPageMatch =
  | { status: "supported" }
  | { status: "missing_fact"; fact: string }
  | { status: "wrong_context"; fact: string; claimLabel: string; pageLabel: string }
  | { status: "needs_model" };

function uniqueLabels(labels: ContextLabel[]): ContextLabel[] {
  const seen = new Set<string>();
  const out: ContextLabel[] = [];
  for (const label of labels) {
    const key = `${label.family}:${label.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function identifierFamily(text: string): string {
  if (/^URS-\d+/i.test(text)) return "urs";
  if (/^SOP\//i.test(text)) return "sop";
  if (/^[A-Z]{2,8}[-/]\d{3,6}/.test(text)) return "equipment";
  return "id";
}

export function contextLabelsFromText(text: string): ContextLabel[] {
  const labels: ContextLabel[] = [];
  for (const fact of extractHardFacts(text)) {
    if (fact.kind !== "identifier") continue;
    labels.push({
      family: identifierFamily(fact.normalized),
      value: fact.normalized,
      text: fact.text,
    });
  }
  SUBJECT_RE.lastIndex = 0;
  let subject: RegExpExecArray | null;
  while ((subject = SUBJECT_RE.exec(text))) {
    labels.push({
      family: subject[1]!.toLowerCase(),
      value: subject[2]!.toUpperCase(),
      text: subject[0]!,
    });
  }
  EQUIPMENT_ID_RE.lastIndex = 0;
  let equipment: RegExpExecArray | null;
  while ((equipment = EQUIPMENT_ID_RE.exec(text))) {
    labels.push({
      family: "equipment",
      value: equipment[0]!.toUpperCase(),
      text: equipment[0]!,
    });
  }
  return uniqueLabels(labels);
}

function windowHasLabel(window: string, label: ContextLabel): boolean {
  return window.toLowerCase().includes(label.text.toLowerCase());
}

function competingInWindow(
  window: string,
  claimLabel: ContextLabel,
  pageLabels: readonly ContextLabel[]
): ContextLabel | null {
  if (windowHasLabel(window, claimLabel)) return null;
  return (
    pageLabels.find(
      (label) =>
        label.family === claimLabel.family &&
        label.value !== claimLabel.value &&
        windowHasLabel(window, label)
    ) ?? null
  );
}

function spansContainingFact(quote: string, fact: HardFact): string[] {
  const hits: string[] = [];
  for (const span of splitSentences(quote)) {
    const slice = quote.slice(span.start, span.end);
    if (evidenceContainsFact(slice, fact)) hits.push(slice);
  }
  if (hits.length > 0) return hits;
  if (evidenceContainsFact(quote, fact)) return [quote];
  return [];
}

function measuredFacts(claim: string): HardFact[] {
  return extractHardFacts(claim).filter((fact) => fact.kind !== "identifier");
}

/**
 * Presence of hard facts on the cited page, plus same-subject context
 * (vessel 1 vs vessel 2, URS-5 vs URS-37, GLR-1301 vs GLR-1302).
 * `needs_model` when OCR/layout is not decisive — caller should ask the
 * LLM, and treat `partial` as a human confirmation.
 */
export function matchClaimToCitedPage(claim: string, pageQuote: string): ClaimPageMatch {
  const facts = measuredFacts(claim);
  const identifiers = extractHardFacts(claim).filter(
    (fact) => fact.kind === "identifier"
  );
  if (facts.length === 0 && identifiers.length === 0) return { status: "needs_model" };
  if (!pageQuote.trim()) {
    const missing = facts[0] ?? identifiers[0]!;
    return { status: "missing_fact", fact: missing.text };
  }

  for (const fact of [...identifiers, ...facts]) {
    if (!evidenceContainsFact(pageQuote, fact)) {
      return { status: "missing_fact", fact: fact.text };
    }
  }

  const claimLabels = contextLabelsFromText(claim);
  // Facts are on the page and the claim named no subject to mix up
  // (a date cell, a lone batch ID). Asking the model here adds noise.
  if (claimLabels.length === 0) return { status: "supported" };

  const pageLabels = contextLabelsFromText(pageQuote);
  let sawUnclear = false;
  for (const fact of facts.length > 0 ? facts : identifiers) {
    const windows = spansContainingFact(pageQuote, fact);
    if (windows.length === 0) return { status: "needs_model" };
    let matched = false;
    let conflict: { fact: string; claimLabel: string; pageLabel: string } | null =
      null;
    for (const window of windows) {
      const missingClaim = claimLabels.filter(
        (label) => !windowHasLabel(window, label)
      );
      const rivalWithClaim = claimLabels
        .flatMap((label) => {
          const rival = pageLabels.find(
            (pageLabel) =>
              pageLabel.family === label.family &&
              pageLabel.value !== label.value &&
              windowHasLabel(window, pageLabel)
          );
          return rival ? [{ label, rival }] : [];
        })[0];
      if (missingClaim.length === 0) {
        // Claim labels are here, but a sibling subject is too — the extract
        // did not isolate which subject owns the fact.
        if (rivalWithClaim) {
          sawUnclear = true;
          continue;
        }
        matched = true;
        break;
      }
      for (const label of missingClaim) {
        const rival = competingInWindow(window, label, pageLabels);
        if (rival) {
          conflict = {
            fact: fact.text,
            claimLabel: label.text,
            pageLabel: rival.text,
          };
        }
      }
    }
    if (matched) continue;
    if (conflict) return { status: "wrong_context", ...conflict };
    sawUnclear = true;
  }
  if (sawUnclear) return { status: "needs_model" };
  return { status: "supported" };
}

function sentenceAround(text: string, index: number, length: number): string {
  for (const span of splitSentences(text)) {
    if (index >= span.start && index < span.end) {
      return text.slice(span.start, span.end).trim();
    }
  }
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const after = text.indexOf(".", index + length);
  const end =
    after === -1 ? Math.min(text.length, index + length + 180) : after + 1;
  return text.slice(start, end).trim();
}

function cellText(index: ReturnType<typeof flattenForAnchor>, cell: {
  flatStart: number;
  flatEnd: number;
}): string {
  return index.text.slice(cell.flatStart, cell.flatEnd).trim();
}

/**
 * Table row with column headers, otherwise the sentence that holds `[n]`.
 * Flattened cells are newline-separated, so a date cell would otherwise
 * lose the equipment / document name sitting in the same row.
 */
export function claimWindowForCitation(
  fieldText: string,
  markerStart: number,
  markerLength: number,
  doc: JSONContent | null
): string {
  if (doc) {
    const index = flattenForAnchor(doc);
    const cell = index.cells.find(
      (row) => markerStart >= row.flatStart && markerStart < row.flatEnd
    );
    if (cell) {
      const headers = index.cells
        .filter(
          (row) => row.tableIndex === cell.tableIndex && row.row === 0
        )
        .toSorted((a, b) => a.col - b.col);
      const rowCells = index.cells
        .filter(
          (row) =>
            row.tableIndex === cell.tableIndex && row.row === cell.row
        )
        .toSorted((a, b) => a.col - b.col);
      const parts = rowCells.flatMap((rowCell, col) => {
        const value = cellText(index, rowCell);
        if (!value) return [];
        const header = headers[col] ? cellText(index, headers[col]!) : "";
        return [header ? `${header}: ${value}` : value];
      });
      const joined = parts.join(" | ");
      if (joined.trim()) return joined;
    }
  }
  return sentenceAround(fieldText, markerStart, markerLength);
}

export function supportMatchMessage(
  marker: string,
  source: string,
  match: Exclude<ClaimPageMatch, { status: "supported" | "needs_model" }>
): string {
  if (match.status === "missing_fact") {
    return `${marker} does not support “${match.fact}” on ${source}. That value is not on the cited page.`;
  }
  return `${marker} cites a different subject on ${source}: “${match.fact}” sits with ${match.pageLabel}, not ${match.claimLabel}.`;
}
