import type { HardFact } from "@/lib/ai/chat/claim-facts";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { UNSUPPORTED_FACTS_RETRY_MESSAGE } from "@/lib/ai/chat/ground-draft";
import { stripPlaceholderLabel } from "@/lib/ai/chat/placeholder-fill";
import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import { collectPlaceholderSpans } from "@/lib/placeholders/find";
import { searchReportDocumentsMany } from "@/lib/attachments/retrieval";
import {
  isBannerInsertRow,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

export const UNSUPPORTED_FACTS_REPAIR_MAX_QUERIES = 8;
export const UNSUPPORTED_FACTS_REPAIR_PER_QUERY_LIMIT = 3;
export const UNSUPPORTED_FACTS_REPAIR_MAX_HITS = 8;

export type RepairSearchHit = {
  attachmentId: string;
  filename: string;
  pageNumber: number;
  quote: string;
  citationId: string;
  sourceSha256?: string;
};

export type UnsupportedFactsRepairHit = {
  filename: string;
  pageNumber: number;
  quote: string;
  citation: string;
};

/**
 * Closed-set queries for a blocked write: the unsourced fact texts plus
 * leftover placeholder labels with nearby row/sentence context. Not a page
 * walk and not an LLM subagent — same retriever as C1 placeholder fill.
 */
export function repairSearchQueries(input: {
  unsupported?: readonly HardFact[];
  texts?: readonly string[];
}): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const query = raw.replace(/\s+/g, " ").trim();
    if (query.length < 3) return;
    const key = query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(query);
  };

  for (const fact of input.unsupported ?? []) {
    add(fact.text);
  }
  for (const text of input.texts ?? []) {
    for (const query of queriesFromPlaceholderText(text)) {
      add(query);
    }
  }
  return queries.slice(0, UNSUPPORTED_FACTS_REPAIR_MAX_QUERIES);
}

export function repairTextsFromTableOperation(
  operation: TableOperation
): string[] {
  switch (operation.kind) {
    case "edit_cells":
      return operation.cells.map((cell) => cell.insertText);
    case "insert_rows":
      return operation.rows.map((row) =>
        isBannerInsertRow(row) ? row.banner : row.join(" ")
      );
    case "insert_column":
      return [operation.header, ...(operation.values ?? [])];
    case "create_table":
      return [
        operation.headers.join(" "),
        ...(operation.rows ?? []).map((row) => row.join(" ")),
      ];
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      return [];
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export async function searchUnsupportedFactsRepair(input: {
  reportId: string;
  queries: readonly string[];
  attachmentIds?: readonly string[];
}): Promise<RepairSearchHit[]> {
  const queries = input.queries
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query) => query.length >= 3);
  if (queries.length === 0) return [];

  try {
    const arms = await searchReportDocumentsMany({
      reportId: input.reportId,
      queries,
      limit: UNSUPPORTED_FACTS_REPAIR_PER_QUERY_LIMIT,
      attachmentIds: input.attachmentIds,
      backfill: input.attachmentIds === undefined,
    });
    const byId = new Map<string, RepairSearchHit>();
    for (const arm of arms) {
      for (const hit of arm) {
        if (byId.has(hit.citationId)) continue;
        const quote = (hit.quote || hit.text).trim();
        if (!quote) continue;
        byId.set(hit.citationId, {
          attachmentId: hit.attachmentId,
          filename: hit.filename,
          pageNumber: hit.pageNumber,
          quote,
          citationId: hit.citationId,
          sourceSha256: hit.sourceSha256,
        });
        if (byId.size >= UNSUPPORTED_FACTS_REPAIR_MAX_HITS) {
          return Array.from(byId.values());
        }
      }
    }
    return Array.from(byId.values());
  } catch (err) {
    console.error("chat: unsupported-facts repair search failed", err);
    return [];
  }
}

/** Record search quotes onto the ledger. Returns hits that newly gained a quote. */
export function seedRepairHits(
  ledger: CitationPageLedger,
  hits: readonly RepairSearchHit[]
): RepairSearchHit[] {
  const quotedBefore = quotedPageKeys(ledger);
  for (const hit of hits) {
    ledger.record(hit.filename, hit.pageNumber, hit.attachmentId, {
      quote: hit.quote,
      citationId: hit.citationId,
      sourceSha256: hit.sourceSha256,
    });
  }
  return hits.filter(
    (hit) => !quotedBefore.has(`${hit.attachmentId}:${hit.pageNumber}`)
  );
}

export function toUnsupportedFactsRepairHits(
  hits: readonly RepairSearchHit[]
): UnsupportedFactsRepairHit[] {
  return hits.map((hit) => ({
    filename: hit.filename,
    pageNumber: hit.pageNumber,
    quote: hit.quote,
    citation: `[${hit.filename}, p. ${hit.pageNumber}]`,
  }));
}

export function unsupportedFactsRepairMessage(
  hits: readonly RepairSearchHit[]
): string {
  if (hits.length === 0) return UNSUPPORTED_FACTS_RETRY_MESSAGE;
  const lines = [
    UNSUPPORTED_FACTS_RETRY_MESSAGE,
    "Repair search found these pages:",
  ];
  for (const hit of hits) {
    const filename = sanitizePromptMetadata(hit.filename, 180) || "unnamed";
    const snippet = sanitizePromptMetadata(hit.quote, 220);
    if (!snippet) continue;
    lines.push(`- [${filename}, p. ${hit.pageNumber}] ${snippet}`);
  }
  if (lines.length <= 2) return UNSUPPORTED_FACTS_RETRY_MESSAGE;
  return lines.join("\n");
}

function quotedPageKeys(ledger: CitationPageLedger): Set<string> {
  const keys = new Set<string>();
  for (const page of ledger.recordedPages()) {
    if (!page.quote.trim()) continue;
    keys.add(`${page.id}:${page.pageNumber}`);
  }
  return keys;
}

function queriesFromPlaceholderText(text: string): string[] {
  const spans = collectPlaceholderSpans(text);
  if (spans.length === 0) return [];
  const context = stripPlaceholderLabel(
    text.replace(/\[[^\]]+\]/g, " ")
  );
  return spans.map((span) => {
    const label = stripPlaceholderLabel(span.text);
    return [context, label].filter((part) => part.length > 0).join(" ");
  });
}
