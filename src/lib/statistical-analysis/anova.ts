import {
  MAX_ANOVA_GROUPS,
  MIN_ANOVA_GROUPS,
  type OneWayAnovaConfig,
  type OneWayAnovaResult,
  type AnovaComputeOutcome,
  type AnovaGroupStats,
  type AnovaPairwiseRow,
  type WorksheetColumn,
  type WorksheetData,
} from "./types";
import { fSurvival, studentTCritical, studentTTwoTailedP } from "./incomplete-beta";
import {
  cellsForRowSelection,
  columnNumericValues,
  dataSheets,
  findColumn,
  findSheetIdForColumn,
  parseNumericCell,
  trimTrailingEmpty,
} from "./worksheet";
import { normalizeRowSelection } from "./row-selection";

function meanOf(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  let sumSq = 0;
  for (const value of values) {
    const d = value - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function sumOfSquares(values: number[], center: number): number {
  let ss = 0;
  for (const value of values) {
    const d = value - center;
    ss += d * d;
  }
  return ss;
}

function columnLooksLikeFactor(column: WorksheetColumn): boolean {
  const trimmed = trimTrailingEmpty(column.values);
  if (trimmed.length === 0) return false;
  const numeric = columnNumericValues(column);
  return numeric.skipped > numeric.values.length;
}

/** Next column on the same sheet, else the first more-label-like neighbor. */
export function suggestFactorColumn(
  worksheet: WorksheetData,
  responseColumnId: string
): string | null {
  const sheetId = findSheetIdForColumn(worksheet, responseColumnId);
  const sheets = dataSheets(worksheet);
  const sheet =
    sheets.find((item) => item.id === sheetId) ?? sheets[0] ?? null;
  if (!sheet) return null;
  const index = sheet.columns.findIndex((column) => column.id === responseColumnId);
  const next = index >= 0 ? sheet.columns[index + 1] : undefined;
  if (next) return next.id;
  const others = sheet.columns.filter((column) => column.id !== responseColumnId);
  if (others.length === 0) return null;
  const labeled = others.find(columnLooksLikeFactor);
  return labeled?.id ?? others[0]?.id ?? null;
}

export function computeOneWayAnova(
  worksheet: WorksheetData,
  config: OneWayAnovaConfig
): AnovaComputeOutcome {
  const response = findColumn(worksheet, config.responseColumnId);
  const factor = findColumn(worksheet, config.factorColumnId);
  if (!response || !factor) {
    return {
      ok: false,
      code: "missing_columns",
      message: "Select a response column and a factor column.",
    };
  }
  if (response.id === factor.id) {
    return {
      ok: false,
      code: "same_column",
      message: "Response and factor must be different columns.",
    };
  }
  const responseSheet = findSheetIdForColumn(worksheet, response.id);
  const factorSheet = findSheetIdForColumn(worksheet, factor.id);
  if (!responseSheet || !factorSheet || responseSheet !== factorSheet) {
    return {
      ok: false,
      code: "different_sheets",
      message: "Response and factor must be on the same data sheet.",
    };
  }

  const alpha = config.alpha ?? 0.05;
  if (!(alpha > 0 && alpha < 1)) {
    return {
      ok: false,
      code: "invalid_alpha",
      message: "Alpha must be between 0 and 1.",
    };
  }

  const selection = normalizeRowSelection(config);
  const responseCells = cellsForRowSelection(response, selection);
  const factorCells = cellsForRowSelection(factor, selection);
  const rowCount = Math.max(responseCells.length, factorCells.length);

  const groups = new Map<string, number[]>();
  let skipped = 0;
  for (let i = 0; i < rowCount; i++) {
    const label = (factorCells[i] ?? "").trim();
    const y = parseNumericCell(responseCells[i] ?? "");
    if (!label || y === null) {
      if ((factorCells[i] ?? "").trim() !== "" || (responseCells[i] ?? "").trim() !== "") {
        skipped += 1;
      }
      continue;
    }
    const bucket = groups.get(label);
    if (bucket) bucket.push(y);
    else groups.set(label, [y]);
  }

  const labels = [...groups.keys()].toSorted((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const k = labels.length;
  if (k < MIN_ANOVA_GROUPS) {
    return {
      ok: false,
      code: "too_few_groups",
      message: "Need at least two factor levels with numeric responses.",
    };
  }
  if (k > MAX_ANOVA_GROUPS) {
    return {
      ok: false,
      code: "too_many_groups",
      message: `One-way ANOVA supports at most ${MAX_ANOVA_GROUPS} factor levels.`,
    };
  }

  const allValues: number[] = [];
  for (const label of labels) {
    const values = groups.get(label)!;
    allValues.push(...values);
  }
  const n = allValues.length;
  if (n <= k) {
    return {
      ok: false,
      code: "too_few_observations",
      message:
        "Need more observations than factor levels (error degrees of freedom must be at least 1).",
    };
  }

  const grandMean = meanOf(allValues);
  let ssb = 0;
  let ssw = 0;
  for (const label of labels) {
    const values = groups.get(label)!;
    const groupMean = meanOf(values);
    ssb += values.length * (groupMean - grandMean) * (groupMean - grandMean);
    ssw += sumOfSquares(values, groupMean);
  }
  const sst = ssb + ssw;
  const dfFactor = k - 1;
  const dfError = n - k;
  const dfTotal = n - 1;
  const msFactor = ssb / dfFactor;
  const msError = ssw / dfError;
  const f =
    msError === 0 ? (ssb === 0 ? 0 : Number.POSITIVE_INFINITY) : msFactor / msError;
  const p = fSurvival(f, dfFactor, dfError);
  const rSquared = sst === 0 ? 0 : ssb / sst;
  const tCrit = studentTCritical(dfError, alpha);

  const groupStats: AnovaGroupStats[] = labels.map((label) => {
    const values = groups.get(label)!;
    const mean = meanOf(values);
    const stdev = sampleStdev(values, mean);
    const se = Math.sqrt(msError / values.length);
    const half = Number.isFinite(tCrit) ? tCrit * se : 0;
    return {
      label,
      n: values.length,
      mean,
      stdev,
      se,
      ciLow: mean - half,
      ciHigh: mean + half,
    };
  });

  const pairCount = (k * (k - 1)) / 2;
  const pairwise: AnovaPairwiseRow[] = [];
  for (let i = 0; i < groupStats.length; i++) {
    for (let j = i + 1; j < groupStats.length; j++) {
      const a = groupStats[i]!;
      const b = groupStats[j]!;
      const diff = a.mean - b.mean;
      const se = Math.sqrt(msError * (1 / a.n + 1 / b.n));
      const t =
        se === 0
          ? diff === 0
            ? 0
            : Number.POSITIVE_INFINITY
          : diff / se;
      const pUnadjusted = studentTTwoTailedP(t, dfError);
      const pBonferroni = Math.min(1, pUnadjusted * pairCount);
      pairwise.push({
        groupA: a.label,
        groupB: b.label,
        diff,
        se,
        t,
        pUnadjusted,
        pBonferroni,
        significant: pBonferroni < alpha,
      });
    }
  }

  const result: OneWayAnovaResult = {
    n,
    skipped,
    groupCount: k,
    grandMean,
    alpha,
    table: {
      factor: { df: dfFactor, ss: ssb, ms: msFactor, f, p },
      error: { df: dfError, ss: ssw, ms: msError },
      total: { df: dfTotal, ss: sst },
    },
    rSquared,
    groups: groupStats,
    pairwise,
  };

  return { ok: true, result };
}
