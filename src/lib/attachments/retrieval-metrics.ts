export type RetrievalGoldHit = {
  filename: string;
  page: number;
  /**
   * Substrings that must appear in the returned excerpt for this hit, not
   * just the filename/page. Recall can be 1.0 while every excerpt shows the
   * wrong part of the page (chunk-ordinal-0 header text, not the matched
   * row) — `excerptHitAtK` catches that; `recallAtK` cannot. Optional: pages
   * ingested as scans with no verified transcript (no text layer, no human
   * transcription doc) should leave this unset rather than guess OCR
   * wording.
   */
  mustContain?: string[];
};

export type RetrievalEvalCase = {
  id: string;
  query: string;
  kind: "identifier" | "locator" | "semantic";
  gold: RetrievalGoldHit[];
  /**
   * Natural-language bar for the LLM judge. Required. Describes what a
   * careful reader must be able to conclude from the returned excerpts
   * (or that the answer is legitimately not in the corpus).
   */
  passCriteria: string;
  /**
   * A term that legitimately does not exist in this report's attachments
   * (e.g. a requirement ID that only exists in a different, unrelated
   * document) must not appear in ANY returned excerpt within top-k. Guards
   * against cross-document identifier leakage / hallucinated matches — a
   * query can correctly have `gold: []` (nothing to find) while still
   * failing if the model would confidently cite the wrong page. `gold` may
   * be empty when `passCriteria` is set.
   */
  mustNotContainAnywhere?: string[];
  notes?: string;
};

export type RankedFilenamePage = {
  filename: string;
  pageNumber: number;
};

/** `recallAtK`/`meanReciprocalRank` only need identity; excerpt checks need text. */
export type RankedFilenamePageText = RankedFilenamePage & {
  text: string;
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

/** Case-insensitive, whitespace-collapsed match (OCR often line-breaks mid-phrase). */
function normalizeForContainsCheck(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function excerptContainsAny(
  text: string,
  terms: readonly string[]
): boolean {
  const haystack = normalizeForContainsCheck(text);
  return terms.some((term) => haystack.includes(normalizeForContainsCheck(term)));
}

/**
 * Fraction of `mustContain`-bearing gold hits whose excerpt (not just
 * filename+page) proves the match within the top-`k` window. Returns `null`
 * when no gold hit in this case declares `mustContain` — that means "not
 * applicable", not "failed", so it must not silently average in as a zero
 * across cases that never asserted excerpt content (scanned pages with no
 * verified transcript, for example).
 *
 * A case can score `recallAtK` = 1.0 while `excerptHitAtK` = 0: the page was
 * found, but the excerpt shown to the model was the wrong 900 characters of
 * that page (a table row buried below a repeated UUT header that wins a
 * prefix truncation).
 */
export function excerptHitAtK(
  results: readonly RankedFilenamePageText[],
  gold: readonly RetrievalGoldHit[],
  k: number
): number | null {
  const checkable = gold.filter(
    (hit) => (hit.mustContain?.length ?? 0) > 0
  );
  if (checkable.length === 0) return null;

  const window = results.slice(0, k);
  let hits = 0;
  for (const expected of checkable) {
    const matchedRows = window.filter(
      (row) =>
        filenameMatches(row.filename, expected.filename) &&
        row.pageNumber === expected.page
    );
    const proven = matchedRows.some((row) =>
      excerptContainsAny(row.text, expected.mustContain!)
    );
    if (proven) hits += 1;
  }
  return hits / checkable.length;
}

/**
 * 1 when none of the top-`k` excerpts contain any `terms` entry; 0 when at
 * least one does; `null` when `terms` is empty/undefined (not applicable).
 * The mirror of `excerptHitAtK` for identifiers that legitimately belong to
 * a different document — a hallucinated "found it" citing the wrong file is
 * worse than a correct "not found."
 */
export function noFalsePositiveAtK(
  results: readonly RankedFilenamePageText[],
  terms: readonly string[] | undefined,
  k: number
): number | null {
  if (!terms || terms.length === 0) return null;
  const window = results.slice(0, k);
  const leaked = window.some((row) => excerptContainsAny(row.text, terms));
  return leaked ? 0 : 1;
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
  const passCriteria = requiredString(row.passCriteria, `${id}.passCriteria`);
  const mustNotContainAnywhere = parseMustContain(
    row.mustNotContainAnywhere,
    id
  );
  if (!Array.isArray(row.gold)) {
    throw new Error(`${id}.gold must be an array`);
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
    const mustContain = parseStringArray(
      goldRow.mustContain,
      `${id}.gold[${goldIndex}].mustContain`
    );
    return {
      filename,
      page: page as number,
      ...(mustContain ? { mustContain } : {}),
    };
  });
  const notes =
    row.notes == null ? undefined : requiredString(row.notes, `${id}.notes`);
  return {
    id,
    query,
    kind: kind as RetrievalEvalCase["kind"],
    gold,
    passCriteria,
    ...(mustNotContainAnywhere ? { mustNotContainAnywhere } : {}),
    ...(notes ? { notes } : {}),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function parseMustContain(
  value: unknown,
  caseId: string
): string[] | undefined {
  return parseStringArray(value, `${caseId}.mustNotContainAnywhere`);
}

function parseStringArray(
  value: unknown,
  label: string
): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array when present`);
  }
  return value.map((entry, index) => requiredString(entry, `${label}[${index}]`));
}
