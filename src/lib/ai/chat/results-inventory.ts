import { requirementIds } from "@/lib/attachments/ocr-quality";

export type InventoryFinding = {
  attachmentId: string;
  filename: string;
  pageNumber: number;
  identifiers: string[];
  heading: string | null;
  summary: string;
};

export const RESULTS_INVENTORY_SOURCE_KINDS = [
  "verified_table",
  "executed_set",
  "none",
] as const;

export type ResultsInventorySourceKind =
  (typeof RESULTS_INVENTORY_SOURCE_KINDS)[number];

export type ResultsInventoryConfidence = "high" | "medium" | "low";

export type ResultsInventoryCitation = {
  filename: string;
  pageNumber: number;
};

export type RecommendedResultsInventory = {
  ids: string[];
  sourceKind: ResultsInventorySourceKind;
  confidence: ResultsInventoryConfidence;
  citations: ResultsInventoryCitation[];
};

export type DraftedInventoryMismatch = {
  ok: boolean;
  missingIds: string[];
  unexpectedIds: string[];
  collapsedIds: Array<{ drafted: string; expected: string }>;
};

const VERIFIED_TABLE_RE =
  /requirements?\s+verified|req(?:uirement)?\.?\s*id\b.{0,80}satisfied\s+by|req(?:uirement)?\.?\s*id\b.{0,80}p\s*\/\s*f/i;

const EXECUTED_SET_RE =
  /table of contents|partial execution|(?:^|\b)\d+(?:\.\d+)*\s+datasheets?\b|test methods and data collection/i;

export function emptyRecommendedInventory(): RecommendedResultsInventory {
  return {
    ids: [],
    sourceKind: "none",
    confidence: "low",
    citations: [],
  };
}

export function selectRecommendedInventory(
  findings: readonly InventoryFinding[]
): RecommendedResultsInventory {
  const verified = collectFromFindings(findings, isVerifiedTableFinding);
  if (verified.ids.length > 0) {
    return {
      ...verified,
      sourceKind: "verified_table",
      confidence: "high",
    };
  }

  const executed = collectFromFindings(findings, isExecutedSetFinding);
  if (executed.ids.length > 0) {
    return {
      ...executed,
      sourceKind: "executed_set",
      confidence: "medium",
    };
  }

  return emptyRecommendedInventory();
}

export function compareDraftedInventory(
  draftedIds: readonly string[],
  expectedIds: readonly string[]
): DraftedInventoryMismatch {
  const drafted = uniqueInOrder(draftedIds.map((id) => id.trim()).filter(Boolean));
  const expected = uniqueInOrder(expectedIds.map((id) => id.trim()).filter(Boolean));
  const draftedSet = new Set(drafted);
  const expectedSet = new Set(expected);
  const missingIds = expected.filter((id) => !draftedSet.has(id));
  const unexpectedIds = drafted.filter((id) => !expectedSet.has(id));
  const collapsedIds: Array<{ drafted: string; expected: string }> = [];
  for (const unexpected of unexpectedIds) {
    const child = expected.find(
      (id) => id.startsWith(`${unexpected}.`) && !draftedSet.has(id)
    );
    if (child) collapsedIds.push({ drafted: unexpected, expected: child });
  }
  return {
    ok: missingIds.length === 0 && unexpectedIds.length === 0,
    missingIds,
    unexpectedIds,
    collapsedIds,
  };
}

function collectFromFindings(
  findings: readonly InventoryFinding[],
  match: (finding: InventoryFinding) => boolean
): Pick<RecommendedResultsInventory, "ids" | "citations"> {
  const ids: string[] = [];
  const seenIds = new Set<string>();
  const citations: ResultsInventoryCitation[] = [];
  const seenCitations = new Set<string>();

  for (const finding of findings) {
    if (!match(finding)) continue;
    const extracted = requirementIds(
      [finding.heading ?? "", finding.summary, ...finding.identifiers].join(
        "\n"
      )
    );
    for (const id of extracted) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      ids.push(id);
    }
    const citationKey = `${finding.attachmentId}:${finding.pageNumber}`;
    if (!seenCitations.has(citationKey)) {
      seenCitations.add(citationKey);
      citations.push({
        filename: finding.filename,
        pageNumber: finding.pageNumber,
      });
    }
  }

  return { ids, citations };
}

function isVerifiedTableFinding(finding: InventoryFinding): boolean {
  return VERIFIED_TABLE_RE.test(findingText(finding));
}

function isExecutedSetFinding(finding: InventoryFinding): boolean {
  return EXECUTED_SET_RE.test(findingText(finding));
}

function findingText(finding: InventoryFinding): string {
  return [finding.heading ?? "", finding.summary].join("\n");
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
