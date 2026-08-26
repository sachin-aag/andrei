import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { statisticalAnalyses, statisticalWorkspaces } from "@/db/schema";
import { isPostgresUniqueViolation } from "@/lib/reports/document-no";
import { parseChartSpec } from "@/lib/charts/chart-spec";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  isScatterAnalysis,
  isSixpackAnalysis,
} from "./types";
import type {
  AnalysisKind,
  CapabilitySixpackConfig,
  CapabilitySixpackResult,
  MeasurementScatterConfig,
  MeasurementScatterResult,
  ReportAnalyticsView,
  ScatterAnalysisSummary,
  SixpackAnalysisSummary,
  StatisticalAnalysisSummary,
  WorksheetData,
} from "./types";
import { nextAnalysisTitle } from "./analysis-title";
import { createEmptyWorksheet, findColumn, normalizeWorksheet, upsertSpecRow } from "./worksheet";
import { hashColumnSource, hashScatterSource } from "./hash";
import { computeCapabilitySixpack } from "./sixpack";
import { runMeasurementScatter } from "./measurement-scatter";
import {
  capabilitySixpackInputSchema,
  measurementScatterInputSchema,
  worksheetDataSchema,
} from "./schemas";
import {
  configRowFields,
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";

function asWorksheet(value: unknown): WorksheetData {
  return normalizeWorksheet(worksheetDataSchema.parse(value));
}

function asConfig(value: unknown): CapabilitySixpackConfig {
  const parsed = value as CapabilitySixpackConfig;
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((row) => Number.isInteger(row) && row >= 1)
    : null;
  return {
    columnId: parsed.columnId,
    columnName: parsed.columnName,
    title: parsed.title,
    lsl: parsed.lsl,
    usl: parsed.usl,
    target: parsed.target,
    rowStart: parsed.rowStart ?? null,
    rowEnd: parsed.rowEnd ?? null,
    rows: rows && rows.length > 0 ? rows : null,
  };
}

function asResults(value: unknown): CapabilitySixpackResult {
  return value as CapabilitySixpackResult;
}

function asScatterConfig(value: unknown): MeasurementScatterConfig {
  const parsed = value as MeasurementScatterConfig;
  return {
    query: parsed.query,
    title: parsed.title,
    xLabel: parsed.xLabel,
    yLabel: parsed.yLabel,
    layout: parsed.layout,
  };
}

function asScatterResults(value: unknown): MeasurementScatterResult {
  const parsed = value as MeasurementScatterResult;
  const specs = Array.isArray(parsed.specs)
    ? parsed.specs.flatMap((item) => {
        const spec = parseChartSpec(item);
        return spec ? [spec] : [];
      })
    : [];
  return {
    specs,
    n: typeof parsed.n === "number" ? parsed.n : specs[0]?.points.length ?? 0,
    uom: typeof parsed.uom === "string" ? parsed.uom : "",
  };
}

function asKind(value: string): AnalysisKind {
  return value === MEASUREMENT_SCATTER
    ? MEASUREMENT_SCATTER
    : CAPABILITY_SIXPACK_NORMAL;
}

function iso(value: Date): string {
  return value.toISOString();
}

function toAnalysisSummary(
  row: typeof statisticalAnalyses.$inferSelect,
  worksheet: WorksheetData
): StatisticalAnalysisSummary {
  const kind = asKind(row.kind);
  if (kind === MEASUREMENT_SCATTER) {
    const config = asScatterConfig(row.config);
    const results = asScatterResults(row.results);
    const summary: ScatterAnalysisSummary = {
      id: row.id,
      workspaceId: row.workspaceId,
      kind: MEASUREMENT_SCATTER,
      title: row.title,
      config,
      results,
      sourceHash: row.sourceHash,
      stale: false,
      createdAt: iso(row.createdAt),
    };
    return summary;
  }

  const config = asConfig(row.config);
  const column = findColumn(worksheet, config.columnId);
  const currentHash = column
    ? hashColumnSource(column, normalizeRowSelection(config))
    : "";
  const summary: SixpackAnalysisSummary = {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: row.title,
    config,
    results: asResults(row.results),
    sourceHash: row.sourceHash,
    stale: currentHash !== row.sourceHash,
    createdAt: iso(row.createdAt),
  };
  return summary;
}

async function analysesForWorkspace(
  workspaceId: string,
  worksheet: WorksheetData
): Promise<StatisticalAnalysisSummary[]> {
  const analysisRows = await db
    .select()
    .from(statisticalAnalyses)
    .where(eq(statisticalAnalyses.workspaceId, workspaceId))
    .orderBy(desc(statisticalAnalyses.createdAt));
  return analysisRows.map((row) => toAnalysisSummary(row, worksheet));
}

function toView(
  row: typeof statisticalWorkspaces.$inferSelect,
  analyses: StatisticalAnalysisSummary[]
): ReportAnalyticsView {
  return {
    id: row.id,
    reportId: row.reportId,
    worksheet: asWorksheet(row.worksheet),
    analyses,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function getReportAnalytics(
  reportId: string
): Promise<ReportAnalyticsView | null> {
  const [workspace] = await db
    .select()
    .from(statisticalWorkspaces)
    .where(eq(statisticalWorkspaces.reportId, reportId));
  if (!workspace) return null;
  const worksheet = asWorksheet(workspace.worksheet);
  return toView(workspace, await analysesForWorkspace(workspace.id, worksheet));
}

/**
 * One worksheet per report. Unique on `report_id`; concurrent first visits
 * catch `23505` and reload the winner.
 */
export async function getOrCreateReportAnalytics(
  reportId: string
): Promise<ReportAnalyticsView> {
  const existing = await getReportAnalytics(reportId);
  if (existing) return existing;

  try {
    const [row] = await db
      .insert(statisticalWorkspaces)
      .values({
        name: "Worksheet",
        reportId,
        worksheet: createEmptyWorksheet(),
      })
      .returning();
    if (!row) throw new Error("Failed to create report analytics");
    return toView(row, []);
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) throw error;
    const raced = await getReportAnalytics(reportId);
    if (!raced) throw error;
    return raced;
  }
}

export async function updateReportAnalytics(
  reportId: string,
  worksheet: WorksheetData
): Promise<ReportAnalyticsView | null> {
  const parsed = worksheetDataSchema.safeParse(worksheet);
  if (!parsed.success) return null;

  const [row] = await db
    .update(statisticalWorkspaces)
    .set({
      worksheet: parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(statisticalWorkspaces.reportId, reportId))
    .returning();
  if (!row) return null;
  return getReportAnalytics(reportId);
}

export async function createAnalysisForReport(
  reportId: string,
  input: unknown
): Promise<
  | { ok: true; analytics: ReportAnalyticsView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  if (
    input &&
    typeof input === "object" &&
    "kind" in input &&
    (input as { kind?: unknown }).kind === MEASUREMENT_SCATTER
  ) {
    return createScatterAnalysisForReport(reportId, input);
  }
  return createSixpackAnalysisForReport(reportId, input);
}

async function createSixpackAnalysisForReport(
  reportId: string,
  input: unknown
): Promise<
  | { ok: true; analytics: ReportAnalyticsView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  const parsed = capabilitySixpackInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Invalid analysis options.",
    };
  }

  const analytics = await getReportAnalytics(reportId);
  if (!analytics) return { ok: false, status: 404, error: "Not found" };

  const column = findColumn(analytics.worksheet, parsed.data.columnId);
  if (!column) {
    return { ok: false, status: 400, error: "Select a worksheet column." };
  }

  const rowSelection = normalizeRowSelection(parsed.data);
  const rowFields = configRowFields(rowSelection);
  const rowLabel = formatRowSelection(rowSelection);
  const title = nextAnalysisTitle(
    analytics.analyses.map((item) => item.title),
    parsed.data.title?.trim() ||
      (rowLabel ? `${column.name} (${rowLabel})` : column.name)
  );

  const config: CapabilitySixpackConfig = {
    columnId: column.id,
    columnName: column.name,
    title,
    lsl: parsed.data.lsl,
    usl: parsed.data.usl,
    target: parsed.data.target,
    ...rowFields,
  };

  const outcome = computeCapabilitySixpack(analytics.worksheet, config);
  if (!outcome.ok) {
    return { ok: false, status: 400, error: outcome.message };
  }

  return insertAnalysisRow({
    reportId,
    workspaceId: analytics.id,
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: config.title,
    config,
    results: outcome.result,
    sourceHash: hashColumnSource(column, rowSelection),
  });
}

async function createScatterAnalysisForReport(
  reportId: string,
  input: unknown
): Promise<
  | { ok: true; analytics: ReportAnalyticsView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  const parsed = measurementScatterInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Invalid plot options.",
    };
  }

  const analytics = await getOrCreateReportAnalytics(reportId);
  const scatter = await runMeasurementScatter({
    reportId,
    query: parsed.data.query,
    title: parsed.data.title,
    xLabel: parsed.data.xLabel,
    yLabel: parsed.data.yLabel,
    layout: parsed.data.layout,
    existingTitles: analytics.analyses.map((item) => item.title),
  });
  if (!scatter.ok) {
    return { ok: false, status: 400, error: scatter.error };
  }

  const limits = scatter.results.specs[0]?.limits;
  if (limits && (limits.lower != null || limits.upper != null)) {
    const withSpecs = upsertSpecRow(analytics.worksheet, {
      columnName: scatter.config.query,
      lsl: limits.lower != null ? String(limits.lower) : "",
      usl: limits.upper != null ? String(limits.upper) : "",
      target: "",
    });
    await updateReportAnalytics(reportId, withSpecs);
  }

  return insertAnalysisRow({
    reportId,
    workspaceId: analytics.id,
    kind: MEASUREMENT_SCATTER,
    title: scatter.config.title,
    config: scatter.config,
    results: scatter.results,
    sourceHash: hashScatterSource(scatter.config.query, scatter.results),
  });
}

async function insertAnalysisRow(input: {
  reportId: string;
  workspaceId: string;
  kind: AnalysisKind;
  title: string;
  config: CapabilitySixpackConfig | MeasurementScatterConfig;
  results: CapabilitySixpackResult | MeasurementScatterResult;
  sourceHash: string;
}): Promise<
  | { ok: true; analytics: ReportAnalyticsView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  const [row] = await db
    .insert(statisticalAnalyses)
    .values({
      workspaceId: input.workspaceId,
      kind: input.kind,
      title: input.title,
      config: input.config,
      results: input.results,
      sourceHash: input.sourceHash,
    })
    .returning();
  if (!row) {
    return { ok: false, status: 400, error: "Failed to save the analysis." };
  }

  await db
    .update(statisticalWorkspaces)
    .set({ updatedAt: new Date() })
    .where(eq(statisticalWorkspaces.id, input.workspaceId));

  const next = await getReportAnalytics(input.reportId);
  if (!next) return { ok: false, status: 404, error: "Not found" };
  const analysis = next.analyses.find((item) => item.id === row.id);
  if (!analysis) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, analytics: next, analysis };
}

export async function recomputeAnalysisForReport(
  reportId: string,
  analysisId: string
): Promise<
  | { ok: true; analytics: ReportAnalyticsView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  const analytics = await getReportAnalytics(reportId);
  if (!analytics) return { ok: false, status: 404, error: "Not found" };
  const existing = analytics.analyses.find((item) => item.id === analysisId);
  if (!existing) return { ok: false, status: 404, error: "Not found" };

  if (isScatterAnalysis(existing)) {
    const scatter = await runMeasurementScatter({
      reportId,
      query: existing.config.query,
      title: existing.config.title,
      xLabel: existing.config.xLabel,
      yLabel: existing.config.yLabel,
      layout: {
        mode: existing.config.layout.mode,
        seriesBy: existing.config.layout.seriesBy,
        xAxis: existing.config.layout.xAxis,
        yMax: existing.config.layout.yRange?.max,
      },
      existingTitles: analytics.analyses
        .filter((item) => item.id !== existing.id)
        .map((item) => item.title),
    });
    if (!scatter.ok) {
      return { ok: false, status: 400, error: scatter.error };
    }
    await db
      .update(statisticalAnalyses)
      .set({
        title: scatter.config.title,
        config: scatter.config,
        results: scatter.results,
        sourceHash: hashScatterSource(scatter.config.query, scatter.results),
      })
      .where(
        and(
          eq(statisticalAnalyses.id, analysisId),
          eq(statisticalAnalyses.workspaceId, analytics.id)
        )
      );
  } else if (isSixpackAnalysis(existing)) {
    const column = findColumn(analytics.worksheet, existing.config.columnId);
    if (!column) {
      return {
        ok: false,
        status: 400,
        error: "The original column is no longer in the worksheet.",
      };
    }

    const config: CapabilitySixpackConfig = {
      ...existing.config,
      columnName: column.name,
    };
    const outcome = computeCapabilitySixpack(analytics.worksheet, config);
    if (!outcome.ok) {
      return { ok: false, status: 400, error: outcome.message };
    }

    await db
      .update(statisticalAnalyses)
      .set({
        title: config.title,
        config,
        results: outcome.result,
        sourceHash: hashColumnSource(column, normalizeRowSelection(config)),
      })
      .where(
        and(
          eq(statisticalAnalyses.id, analysisId),
          eq(statisticalAnalyses.workspaceId, analytics.id)
        )
      );
  } else {
    const exhaustive: never = existing;
    return exhaustive;
  }

  await db
    .update(statisticalWorkspaces)
    .set({ updatedAt: new Date() })
    .where(eq(statisticalWorkspaces.id, analytics.id));

  const next = await getReportAnalytics(reportId);
  if (!next) return { ok: false, status: 404, error: "Not found" };
  const analysis = next.analyses.find((item) => item.id === analysisId);
  if (!analysis) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, analytics: next, analysis };
}

export async function deleteAnalysisForReport(
  reportId: string,
  analysisId: string
): Promise<ReportAnalyticsView | null> {
  const analytics = await getReportAnalytics(reportId);
  if (!analytics) return null;
  await db
    .delete(statisticalAnalyses)
    .where(
      and(
        eq(statisticalAnalyses.id, analysisId),
        eq(statisticalAnalyses.workspaceId, analytics.id)
      )
    );
  return getReportAnalytics(reportId);
}
