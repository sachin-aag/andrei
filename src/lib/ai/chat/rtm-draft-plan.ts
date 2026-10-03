import type { JSONContent } from "@tiptap/core";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  isQsrRtmSection,
  isUrsFilename,
  liveTableRowContextByKey,
  missingReviewedUrsIds,
  rtmReferenceColumnIndexes,
  rowKeyFromContext,
  ursIdsForRtmSection,
  type QsrRtmSection,
} from "@/lib/ai/chat/qsr-row-grounding";
import {
  summarizeTablesInDoc,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

export type RtmUrsPage = {
  filename: string;
  pageNumber: number;
  quote: string;
};

export type RtmDraftPlan = {
  section: QsrRtmSection;
  liveRowKeys: string[];
  missingUrsIds: string[];
  identitySparseIds: string[];
  familyBlankIds: string[];
  ursPages: RtmUrsPage[];
  expectedUrsIds: string[];
};

function liveRowsByKey(
  fieldDoc: JSONContent | null | undefined
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!fieldDoc) return map;
  for (const table of summarizeTablesInDoc(fieldDoc)) {
    const byRow = new Map<number, string[]>();
    for (const cell of table.cells) {
      if (cell.row === 0) continue;
      const text = cell.text === "(empty)" ? "" : cell.text.trim();
      const list = byRow.get(cell.row) ?? [];
      list[cell.col] = text;
      byRow.set(cell.row, list);
    }
    for (const cells of byRow.values()) {
      const first = (cells[0] ?? "").replace(/\s+/g, " ").trim();
      const key = rowKeyFromContext(first);
      if (!key) continue;
      map.set(key, cells);
    }
  }
  return map;
}

function identityColsEmpty(
  cells: readonly string[],
  firstFamilyCol: number
): boolean {
  for (let col = 1; col < firstFamilyCol; col++) {
    if ((cells[col] ?? "").replace(/\[[^\]]*\]/g, "").trim()) return false;
  }
  return true;
}

function familyColsEmpty(
  cells: readonly string[],
  cols: { dq: number; iq: number; oq: number; pq: number }
): boolean {
  return [cols.dq, cols.iq, cols.oq, cols.pq].every(
    (col) => !(cells[col] ?? "").replace(/\[[^\]]*\]/g, "").trim()
  );
}

export function ursPagesFromLedger(ledger: CitationPageLedger): RtmUrsPage[] {
  return ledger
    .recordedPages()
    .filter((page) => isUrsFilename(page.filename) && page.quote.trim())
    .map((page) => ({
      filename: page.filename,
      pageNumber: page.pageNumber,
      quote: page.quote,
    }));
}

/**
 * Checklist = reviewed URS IDs for this table minus rows already live.
 * Protocol pages never contribute IDs.
 */
export function planRtmDraft(input: {
  section: string;
  ledger: CitationPageLedger;
  fieldDoc: JSONContent | null;
}): RtmDraftPlan | null {
  if (!isQsrRtmSection(input.section)) return null;
  const section = input.section;
  const ursPages = ursPagesFromLedger(input.ledger);
  const expectedUrsIds = ursIdsForRtmSection(
    ursPages.map((page) => page.quote),
    section
  );
  const live = liveRowsByKey(input.fieldDoc);
  const liveRowKeys = [...liveTableRowContextByKey(input.fieldDoc).keys()].filter(
    (key) => rowKeyFromContext(key)
  );
  const liveUrs = new Set(
    [...live.keys()].map((key) => key.toUpperCase())
  );
  const missingUrsIds = expectedUrsIds.filter((id) => !liveUrs.has(id));
  const cols = rtmReferenceColumnIndexes(section);
  const firstFamilyCol = cols?.dq ?? 3;
  const identitySparseIds: string[] = [];
  const familyBlankIds: string[] = [];
  for (const id of expectedUrsIds) {
    const cells = live.get(id);
    if (!cells) continue;
    if (identityColsEmpty(cells, firstFamilyCol)) identitySparseIds.push(id);
    if (cols && familyColsEmpty(cells, cols)) familyBlankIds.push(id);
  }
  return {
    section,
    liveRowKeys,
    missingUrsIds,
    identitySparseIds,
    familyBlankIds,
    ursPages,
    expectedUrsIds,
  };
}

export function rtmDraftNothingToDo(plan: RtmDraftPlan): boolean {
  return (
    plan.missingUrsIds.length === 0 &&
    plan.identitySparseIds.length === 0 &&
    plan.familyBlankIds.length === 0
  );
}

/**
 * IDs still missing after every composed operation. Intersect per-op gaps so
 * a follow-up edit_cells of a seeded row cannot re-list IDs the insert landed.
 */
export function leftoverMissingUrsIds(input: {
  operations: readonly TableOperation[];
  ledger: CitationPageLedger;
  section: QsrRtmSection;
  fieldDoc: JSONContent | null;
}): string[] {
  if (input.operations.length === 0) return [];
  let leftover: string[] | null = null;
  for (const operation of input.operations) {
    const missing = missingReviewedUrsIds({
      operation,
      ledger: input.ledger,
      section: input.section,
      fieldDoc: input.fieldDoc,
    });
    leftover =
      leftover == null
        ? missing
        : missing.filter((id) => leftover!.includes(id));
  }
  return leftover ?? [];
}
