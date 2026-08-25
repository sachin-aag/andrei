import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { statisticalAnalyses, statisticalWorkspaces } from "@/db/schema";
import { isPostgresUniqueViolation } from "@/lib/reports/document-no";
import { CAPABILITY_SIXPACK_NORMAL } from "./types";
import type {
  AnalysisKind,
  CapabilitySixpackConfig,
  CapabilitySixpackResult,
  ReportAnalyticsView,
  StatisticalAnalysisSummary,
  WorksheetData,
} from "./types";
import { createEmptyWorksheet, findColumn } from "./worksheet";
import { hashColumnSource } from "./hash";
import { computeCapabilitySixpack } from "./sixpack";
import { capabilitySixpackInputSchema, worksheetDataSchema } from "./schemas";

function asWorksheet(value: unknown): WorksheetData {
  return worksheetDataSchema.parse(value);
}

function asConfig(value: unknown): CapabilitySixpackConfig {
  const parsed = value as CapabilitySixpackConfig;
  return {
    columnId: parsed.columnId,
    columnName: parsed.columnName,
    title: parsed.title,
    lsl: parsed.lsl,
    usl: parsed.usl,
    target: parsed.target,
  };
}

function asResults(value: unknown): CapabilitySixpackResult {
  return value as CapabilitySixpackResult;
}

function asKind(value: string): AnalysisKind {
  return value === CAPABILITY_SIXPACK_NORMAL
    ? CAPABILITY_SIXPACK_NORMAL
    : CAPABILITY_SIXPACK_NORMAL;
}

function iso(value: Date): string {
  return value.toISOString();
}

function toAnalysisSummary(
  row: typeof statisticalAnalyses.$inferSelect,
  worksheet: WorksheetData
): StatisticalAnalysisSummary {
  const config = asConfig(row.config);
  const column = findColumn(worksheet, config.columnId);
  const currentHash = column ? hashColumnSource(column) : "";
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: asKind(row.kind),
    title: row.title,
    config,
    results: asResults(row.results),
    sourceHash: row.sourceHash,
    stale: currentHash !== row.sourceHash,
    createdAt: iso(row.createdAt),
  };
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

  const config: CapabilitySixpackConfig = {
    columnId: column.id,
    columnName: column.name,
    title: parsed.data.title?.trim() || column.name,
    lsl: parsed.data.lsl,
    usl: parsed.data.usl,
    target: parsed.data.target,
  };

  const outcome = computeCapabilitySixpack(analytics.worksheet, config);
  if (!outcome.ok) {
    return { ok: false, status: 400, error: outcome.message };
  }

  const [row] = await db
    .insert(statisticalAnalyses)
    .values({
      workspaceId: analytics.id,
      kind: CAPABILITY_SIXPACK_NORMAL,
      title: config.title,
      config,
      results: outcome.result,
      sourceHash: hashColumnSource(column),
    })
    .returning();
  if (!row) {
    return { ok: false, status: 400, error: "Failed to save the analysis." };
  }

  await db
    .update(statisticalWorkspaces)
    .set({ updatedAt: new Date() })
    .where(eq(statisticalWorkspaces.id, analytics.id));

  const next = await getReportAnalytics(reportId);
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
      sourceHash: hashColumnSource(column),
    })
    .where(
      and(
        eq(statisticalAnalyses.id, analysisId),
        eq(statisticalAnalyses.workspaceId, analytics.id)
      )
    );

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
