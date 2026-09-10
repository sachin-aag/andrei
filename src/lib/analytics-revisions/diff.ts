import type {
  AnalyticsRevisionAnalysis,
  AnalyticsRevisionPayload,
} from "@/lib/analytics-revisions/payload";
import type {
  AnalysisKind,
  WorksheetData,
  WorksheetSheet,
} from "@/lib/statistical-analysis/types";

export const MAX_ANALYTICS_CELL_DIFFS = 200;

export type AnalyticsSheetChange =
  | { kind: "added"; name: string }
  | { kind: "removed"; name: string }
  | { kind: "renamed"; from: string; to: string };

export type AnalyticsColumnChange =
  | { kind: "added"; sheet: string; name: string }
  | { kind: "removed"; sheet: string; name: string }
  | { kind: "renamed"; sheet: string; from: string; to: string };

export type AnalyticsCellChange = {
  sheet: string;
  column: string;
  row: number;
  from: string;
  to: string;
};

export type AnalyticsSpecChange = {
  columnName: string;
  field: "lsl" | "usl" | "target";
  from: string;
  to: string;
};

export type AnalyticsAnalysisChange = {
  kind: "added" | "removed" | "changed";
  id: string;
  title: string;
  plotKind: AnalysisKind;
};

export type AnalyticsRevisionDiff = {
  sheets: AnalyticsSheetChange[];
  columns: AnalyticsColumnChange[];
  cells: AnalyticsCellChange[];
  truncatedCells: boolean;
  specs: AnalyticsSpecChange[];
  analyses: AnalyticsAnalysisChange[];
};

function sheetsOf(worksheet: WorksheetData): WorksheetSheet[] {
  if (Array.isArray(worksheet.sheets) && worksheet.sheets.length > 0) {
    return worksheet.sheets;
  }
  return [{ id: "data-1", name: "Sheet 1", columns: worksheet.columns ?? [] }];
}

function cellAt(values: string[] | undefined, index: number): string {
  return values?.[index] ?? "";
}

function analysisFingerprint(analysis: AnalyticsRevisionAnalysis): string {
  return JSON.stringify({
    id: analysis.id,
    title: analysis.title,
    kind: analysis.kind,
    config: analysis.config,
    results: analysis.results,
    sourceHash: analysis.sourceHash,
  });
}

export function analyticsPlotKindLabel(kind: AnalysisKind): string {
  switch (kind) {
    case "capability_sixpack_normal":
      return "sixpack";
    case "measurement_scatter":
      return "measurement scatter";
    case "xy_scatter":
      return "scatter";
    case "one_way_anova":
      return "ANOVA";
    case "boxplot":
      return "boxplot";
    case "histogram":
      return "histogram";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function diffAnalyticsRevisions(
  from: AnalyticsRevisionPayload,
  to: AnalyticsRevisionPayload
): AnalyticsRevisionDiff {
  const fromSheets = sheetsOf(from.worksheet);
  const toSheets = sheetsOf(to.worksheet);
  const fromById = new Map(fromSheets.map((sheet) => [sheet.id, sheet]));
  const toById = new Map(toSheets.map((sheet) => [sheet.id, sheet]));

  const sheets: AnalyticsSheetChange[] = [];
  for (const sheet of toSheets) {
    const prior = fromById.get(sheet.id);
    if (!prior) {
      sheets.push({ kind: "added", name: sheet.name });
    } else if (prior.name !== sheet.name) {
      sheets.push({ kind: "renamed", from: prior.name, to: sheet.name });
    }
  }
  for (const sheet of fromSheets) {
    if (!toById.has(sheet.id)) {
      sheets.push({ kind: "removed", name: sheet.name });
    }
  }

  const columns: AnalyticsColumnChange[] = [];
  const cells: AnalyticsCellChange[] = [];
  let truncatedCells = false;

  for (const sheet of toSheets) {
    const priorSheet = fromById.get(sheet.id);
    const priorCols = new Map(
      (priorSheet?.columns ?? []).map((column) => [column.id, column])
    );
    const nextCols = new Map(sheet.columns.map((column) => [column.id, column]));
    for (const column of sheet.columns) {
      const prior = priorCols.get(column.id);
      if (!prior) {
        columns.push({ kind: "added", sheet: sheet.name, name: column.name });
        continue;
      }
      if (prior.name !== column.name) {
        columns.push({
          kind: "renamed",
          sheet: sheet.name,
          from: prior.name,
          to: column.name,
        });
      }
      const maxLen = Math.max(prior.values.length, column.values.length);
      for (let i = 0; i < maxLen; i++) {
        const fromValue = cellAt(prior.values, i);
        const toValue = cellAt(column.values, i);
        if (fromValue === toValue) continue;
        if (cells.length >= MAX_ANALYTICS_CELL_DIFFS) {
          truncatedCells = true;
          break;
        }
        cells.push({
          sheet: sheet.name,
          column: column.name,
          row: i + 1,
          from: fromValue,
          to: toValue,
        });
      }
    }
    if (priorSheet) {
      for (const column of priorSheet.columns) {
        if (!nextCols.has(column.id)) {
          columns.push({
            kind: "removed",
            sheet: sheet.name,
            name: column.name,
          });
        }
      }
    }
  }

  const specs: AnalyticsSpecChange[] = [];
  const fromSpecs = from.worksheet.specs ?? [];
  const toSpecs = to.worksheet.specs ?? [];
  const fromSpecByName = new Map(fromSpecs.map((row) => [row.columnName, row]));
  const toSpecByName = new Map(toSpecs.map((row) => [row.columnName, row]));
  const specFields = ["lsl", "usl", "target"] as const;
  for (const row of toSpecs) {
    const prior = fromSpecByName.get(row.columnName);
    for (const field of specFields) {
      const fromValue = prior?.[field] ?? "";
      const toValue = row[field] ?? "";
      if (fromValue === toValue) continue;
      specs.push({
        columnName: row.columnName,
        field,
        from: fromValue,
        to: toValue,
      });
    }
  }
  for (const row of fromSpecs) {
    if (toSpecByName.has(row.columnName)) continue;
    for (const field of specFields) {
      const fromValue = row[field] ?? "";
      if (!fromValue) continue;
      specs.push({
        columnName: row.columnName,
        field,
        from: fromValue,
        to: "",
      });
    }
  }

  const fromAnalyses = new Map(from.analyses.map((row) => [row.id, row]));
  const toAnalyses = new Map(to.analyses.map((row) => [row.id, row]));
  const analyses: AnalyticsAnalysisChange[] = [];
  for (const analysis of to.analyses) {
    const prior = fromAnalyses.get(analysis.id);
    if (!prior) {
      analyses.push({
        kind: "added",
        id: analysis.id,
        title: analysis.title,
        plotKind: analysis.kind,
      });
      continue;
    }
    if (analysisFingerprint(prior) !== analysisFingerprint(analysis)) {
      analyses.push({
        kind: "changed",
        id: analysis.id,
        title: analysis.title,
        plotKind: analysis.kind,
      });
    }
  }
  for (const analysis of from.analyses) {
    if (!toAnalyses.has(analysis.id)) {
      analyses.push({
        kind: "removed",
        id: analysis.id,
        title: analysis.title,
        plotKind: analysis.kind,
      });
    }
  }

  return { sheets, columns, cells, truncatedCells, specs, analyses };
}

export function analyticsRevisionDiffIsEmpty(
  diff: AnalyticsRevisionDiff
): boolean {
  return (
    diff.sheets.length === 0 &&
    diff.columns.length === 0 &&
    diff.cells.length === 0 &&
    diff.specs.length === 0 &&
    diff.analyses.length === 0
  );
}
