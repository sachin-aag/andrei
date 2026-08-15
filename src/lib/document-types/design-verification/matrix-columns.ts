/**
 * Semantic column resolution for DV matrices.
 *
 * Prefer header meaning (aliases), then content heuristics for ID-like /
 * pass-fail columns, then positional fallback only when almost nothing
 * resolved — so reformatted AI drafts still evaluate on content.
 */

export type TraceabilityColumnId =
  | "requirementId"
  | "designInput"
  | "testMethodId"
  | "result"
  | "riskControlLink";

export type TestResultsColumnId =
  | "testId"
  | "requirementId"
  | "result"
  | "passFail"
  | "rawDataRef";

export type MatrixColumnSchema<Id extends string> = {
  id: Id;
  /** Human label used in missing-column diagnostics. */
  label: string;
  /** Normalized aliases (already lowercased / punctuation-stripped). */
  aliases: readonly string[];
  /** Content-based inference when header aliases miss. */
  inferFromContent?: "idLike" | "passFail";
};

export const TRACEABILITY_COLUMN_SCHEMA: readonly MatrixColumnSchema<TraceabilityColumnId>[] =
  [
    {
      id: "requirementId",
      label: "Requirement ID",
      aliases: [
        "requirement id",
        "requirement",
        "requirement no",
        "requirement number",
        "req id",
        "req",
        "req no",
        "req number",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "designInput",
      label: "Design Input",
      aliases: [
        "design input",
        "design inputs",
        "input",
        "inputs",
        "requirement text",
        "requirement description",
        "description",
      ],
    },
    {
      id: "testMethodId",
      label: "Test Method / ID",
      aliases: [
        "test method / id",
        "test method id",
        "test method",
        "test methods",
        "test case",
        "test case id",
        "verification method",
        "verification test",
        "method id",
        "method",
        "tm id",
        "tm",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "result",
      label: "Result",
      aliases: ["result", "results", "outcome", "findings"],
    },
    {
      id: "riskControlLink",
      label: "Risk Control Link",
      aliases: [
        "risk control link",
        "risk control",
        "risk controls",
        "risk link",
        "hazard id",
        "hazard",
        "risk id",
        "risk management",
        "risk management link",
        "rmf link",
      ],
    },
  ];

export const TEST_RESULTS_COLUMN_SCHEMA: readonly MatrixColumnSchema<TestResultsColumnId>[] =
  [
    {
      id: "testId",
      label: "Test ID",
      aliases: [
        "test id",
        "test",
        "test no",
        "test number",
        "tm id",
        "tm",
        "method id",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "requirementId",
      label: "Requirement ID",
      aliases: [
        "requirement id",
        "requirement",
        "requirement no",
        "requirement number",
        "req id",
        "req",
        "req no",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "result",
      label: "Result",
      aliases: ["result", "results", "outcome", "findings", "observed"],
    },
    {
      id: "passFail",
      label: "Pass/Fail",
      aliases: [
        "pass fail",
        "pass/fail",
        "verdict",
        "status",
        "disposition",
        "pass or fail",
      ],
      inferFromContent: "passFail",
    },
    {
      id: "rawDataRef",
      label: "Raw Data Ref",
      aliases: [
        "raw data ref",
        "raw data",
        "raw data reference",
        "evidence",
        "evidence ref",
        "data reference",
        "data ref",
        "attachment",
        "attachment ref",
      ],
    },
  ];

export type ColumnResolution<Id extends string> = {
  /** Logical field → header column index. */
  indices: Partial<Record<Id, number>>;
  /** Logical fields that never resolved. */
  unresolved: Id[];
  /** Whether positional fallback was used. */
  usedPositionalFallback: boolean;
};

/** Lowercase, collapse whitespace, strip punctuation to spaces. */
export function normalizeHeader(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[/_.\-–—:()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ID_LIKE = /^[A-Za-z]{1,8}[-_/ ]?\d{1,6}([A-Za-z]{0,4})?$/;
const PASS_FAIL_LIKE =
  /^(pass|fail|passed|failed|met|not met|partial|n\/?a|na)$/i;

function mostlyMatch(
  cells: readonly string[],
  predicate: (cell: string) => boolean
): boolean {
  const nonempty = cells.map((c) => c.trim()).filter(Boolean);
  if (nonempty.length === 0) return false;
  const hits = nonempty.filter(predicate).length;
  return hits / nonempty.length >= 0.6;
}

function isIdLike(cell: string): boolean {
  const t = cell.trim();
  if (!t || t.length > 32) return false;
  if (/\s{2,}/.test(t)) return false;
  if (ID_LIKE.test(t)) return true;
  return /^[A-Za-z0-9][A-Za-z0-9._\-/]{1,24}$/.test(t) && /\d/.test(t);
}

function isPassFailLike(cell: string): boolean {
  return PASS_FAIL_LIKE.test(cell.trim());
}

/**
 * Resolve logical columns for a matrix.
 *
 * 1. Header aliases (exact normalized match, order-independent)
 * 2. Content inference for remaining idLike / passFail fields
 * 3. Positional fallback when fewer than two fields resolved
 */
export function resolveColumns<Id extends string>(
  headers: readonly string[],
  dataRows: readonly (readonly string[])[],
  schema: readonly MatrixColumnSchema<Id>[]
): ColumnResolution<Id> {
  const indices: Partial<Record<Id, number>> = {};
  const claimed = new Set<number>();
  const normalizedHeaders = headers.map(normalizeHeader);

  // Pass 1: exact alias match. Prefer longer aliases so "requirement id"
  // wins over "requirement" when both could apply to different columns.
  const byAliasLength = [...schema].sort(
    (a, b) =>
      Math.max(...b.aliases.map((x) => normalizeHeader(x).length)) -
      Math.max(...a.aliases.map((x) => normalizeHeader(x).length))
  );

  for (const col of byAliasLength) {
    if (indices[col.id] !== undefined) continue;
    const aliasSet = new Set(col.aliases.map(normalizeHeader));
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (claimed.has(i)) continue;
      if (aliasSet.has(normalizedHeaders[i] ?? "")) {
        indices[col.id] = i;
        claimed.add(i);
        break;
      }
    }
  }

  // Pass 2: content inference.
  const colValues = (colIdx: number): string[] =>
    dataRows.map((row) => row[colIdx] ?? "");

  for (const col of schema) {
    if (indices[col.id] !== undefined) continue;
    if (!col.inferFromContent) continue;
    for (let i = 0; i < headers.length; i++) {
      if (claimed.has(i)) continue;
      const cells = colValues(i);
      const match =
        col.inferFromContent === "idLike"
          ? mostlyMatch(cells, isIdLike)
          : mostlyMatch(cells, isPassFailLike);
      if (match) {
        indices[col.id] = i;
        claimed.add(i);
        break;
      }
    }
  }

  // Pass 3: positional fallback when headers are unrecognizable.
  let usedPositionalFallback = false;
  const resolvedCount = Object.keys(indices).length;
  if (resolvedCount < 2) {
    usedPositionalFallback = true;
    for (let i = 0; i < schema.length; i++) {
      const col = schema[i]!;
      if (indices[col.id] !== undefined) continue;
      if (i < headers.length && !claimed.has(i)) {
        indices[col.id] = i;
        claimed.add(i);
        continue;
      }
      for (let j = 0; j < headers.length; j++) {
        if (!claimed.has(j)) {
          indices[col.id] = j;
          claimed.add(j);
          break;
        }
      }
    }
  }

  const unresolved = schema
    .map((c) => c.id)
    .filter((id) => indices[id] === undefined);

  return { indices, unresolved, usedPositionalFallback };
}

export function missingColumnLabels<Id extends string>(
  unresolved: readonly Id[],
  schema: readonly MatrixColumnSchema<Id>[]
): string[] {
  return unresolved.map(
    (id) => schema.find((c) => c.id === id)?.label ?? String(id)
  );
}
