export type RetrievalGoldHit = {
  filename: string;
  page: number;
};

export type RetrievalEvalCase = {
  id: string;
  query: string;
  kind: "identifier" | "locator" | "semantic";
  gold: RetrievalGoldHit[];
  notes?: string;
};

export type RankedFilenamePage = {
  filename: string;
  pageNumber: number;
};

const RETRIEVAL_CASE_KINDS = new Set(["identifier", "locator", "semantic"]);

export function normalizeFilename(value: string): string {
  return value.trim().toLowerCase();
}

export function filenameMatches(actual: string, gold: string): boolean {
  const left = normalizeFilename(actual);
  const right = normalizeFilename(gold);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function goldHitRank(
  results: readonly RankedFilenamePage[],
  gold: readonly RetrievalGoldHit[]
): number | null {
  for (let index = 0; index < results.length; index += 1) {
    const row = results[index]!;
    if (
      gold.some(
        (hit) =>
          filenameMatches(row.filename, hit.filename) && row.pageNumber === hit.page
      )
    ) {
      return index + 1;
    }
  }
  return null;
}

export function recallAtK(
  results: readonly RankedFilenamePage[],
  gold: readonly RetrievalGoldHit[],
  k: number
): number {
  if (gold.length === 0) return 0;
  const window = results.slice(0, k);
  let hits = 0;
  for (const expected of gold) {
    const found = window.some(
      (row) =>
        filenameMatches(row.filename, expected.filename) &&
        row.pageNumber === expected.page
    );
    if (found) hits += 1;
  }
  return hits / gold.length;
}

export function meanReciprocalRank(
  results: readonly RankedFilenamePage[],
  gold: readonly RetrievalGoldHit[]
): number {
  const rank = goldHitRank(results, gold);
  return rank == null ? 0 : 1 / rank;
}

export function parseRetrievalCases(raw: unknown): RetrievalEvalCase[] {
  if (!Array.isArray(raw)) {
    throw new Error("retrieval cases must be a JSON array");
  }
  return raw.map((entry, index) => parseRetrievalCase(entry, index));
}

function parseRetrievalCase(entry: unknown, index: number): RetrievalEvalCase {
  if (!entry || typeof entry !== "object") {
    throw new Error(`retrieval case ${index} must be an object`);
  }
  const row = entry as Record<string, unknown>;
  const id = requiredString(row.id, `case[${index}].id`);
  const query = requiredString(row.query, `${id}.query`);
  const kind = requiredString(row.kind, `${id}.kind`);
  if (!RETRIEVAL_CASE_KINDS.has(kind)) {
    throw new Error(`${id}.kind must be identifier, locator, or semantic`);
  }
  if (!Array.isArray(row.gold) || row.gold.length === 0) {
    throw new Error(`${id}.gold must be a non-empty array`);
  }
  const gold = row.gold.map((hit, goldIndex) => {
    if (!hit || typeof hit !== "object") {
      throw new Error(`${id}.gold[${goldIndex}] must be an object`);
    }
    const goldRow = hit as Record<string, unknown>;
    const filename = requiredString(goldRow.filename, `${id}.gold[${goldIndex}].filename`);
    const page = goldRow.page;
    if (!Number.isInteger(page) || (page as number) < 1) {
      throw new Error(`${id}.gold[${goldIndex}].page must be a 1-based integer`);
    }
    return { filename, page: page as number };
  });
  const notes =
    row.notes == null ? undefined : requiredString(row.notes, `${id}.notes`);
  return {
    id,
    query,
    kind: kind as RetrievalEvalCase["kind"],
    gold,
    ...(notes ? { notes } : {}),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}
