import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { statisticalAnalyses, statisticalWorkspaces } from "@/db/schema";
import { CAPABILITY_SIXPACK_NORMAL } from "./types";
import type {
  AnalysisKind,
  CapabilitySixpackConfig,
  CapabilitySixpackResult,
  StatisticalAnalysisSummary,
  StatisticalWorkspaceSummary,
  StatisticalWorkspaceView,
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

export async function listWorkspacesForUser(
  userId: string
): Promise<StatisticalWorkspaceSummary[]> {
  const rows = await db
    .select({
      workspace: statisticalWorkspaces,
      analysisCount: sql<number>`cast(count(${statisticalAnalyses.id}) as int)`,
    })
    .from(statisticalWorkspaces)
    .leftJoin(
      statisticalAnalyses,
      eq(statisticalAnalyses.workspaceId, statisticalWorkspaces.id)
    )
    .where(eq(statisticalWorkspaces.ownerId, userId))
    .groupBy(statisticalWorkspaces.id)
    .orderBy(desc(statisticalWorkspaces.updatedAt));

  return rows.map(({ workspace, analysisCount }) => ({
    id: workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId,
    analysisCount: Number(analysisCount),
    createdAt: iso(workspace.createdAt),
    updatedAt: iso(workspace.updatedAt),
  }));
}

export async function createWorkspaceForUser(
  userId: string,
  name = "Untitled worksheet"
): Promise<StatisticalWorkspaceView> {
  const [row] = await db
    .insert(statisticalWorkspaces)
    .values({
      name,
      ownerId: userId,
      worksheet: createEmptyWorksheet(),
    })
    .returning();
  if (!row) throw new Error("Failed to create statistical workspace");
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    worksheet: asWorksheet(row.worksheet),
    analyses: [],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string
): Promise<StatisticalWorkspaceView | null> {
  const [workspace] = await db
    .select()
    .from(statisticalWorkspaces)
    .where(
      and(
        eq(statisticalWorkspaces.id, workspaceId),
        eq(statisticalWorkspaces.ownerId, userId)
      )
    );
  if (!workspace) return null;

  const analysisRows = await db
    .select()
    .from(statisticalAnalyses)
    .where(eq(statisticalAnalyses.workspaceId, workspace.id))
    .orderBy(desc(statisticalAnalyses.createdAt));

  const worksheet = asWorksheet(workspace.worksheet);
  return {
    id: workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId,
    worksheet,
    analyses: analysisRows.map((row) => toAnalysisSummary(row, worksheet)),
    createdAt: iso(workspace.createdAt),
    updatedAt: iso(workspace.updatedAt),
  };
}

export async function updateWorkspaceForUser(
  workspaceId: string,
  userId: string,
  patch: { name?: string; worksheet?: WorksheetData }
): Promise<StatisticalWorkspaceView | null> {
  const existing = await getWorkspaceForUser(workspaceId, userId);
  if (!existing) return null;

  const [row] = await db
    .update(statisticalWorkspaces)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.worksheet !== undefined ? { worksheet: patch.worksheet } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(statisticalWorkspaces.id, workspaceId),
        eq(statisticalWorkspaces.ownerId, userId)
      )
    )
    .returning();
  if (!row) return null;
  return getWorkspaceForUser(workspaceId, userId);
}

export async function deleteWorkspaceForUser(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(statisticalWorkspaces)
    .where(
      and(
        eq(statisticalWorkspaces.id, workspaceId),
        eq(statisticalWorkspaces.ownerId, userId)
      )
    )
    .returning({ id: statisticalWorkspaces.id });
  return deleted.length > 0;
}

export async function createAnalysisForUser(
  workspaceId: string,
  userId: string,
  input: unknown
): Promise<
  | { ok: true; workspace: StatisticalWorkspaceView; analysis: StatisticalAnalysisSummary }
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

  const workspace = await getWorkspaceForUser(workspaceId, userId);
  if (!workspace) return { ok: false, status: 404, error: "Not found" };

  const column = findColumn(workspace.worksheet, parsed.data.columnId);
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

  const outcome = computeCapabilitySixpack(workspace.worksheet, config);
  if (!outcome.ok) {
    return { ok: false, status: 400, error: outcome.message };
  }

  const [row] = await db
    .insert(statisticalAnalyses)
    .values({
      workspaceId: workspace.id,
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
    .where(eq(statisticalWorkspaces.id, workspace.id));

  const next = await getWorkspaceForUser(workspaceId, userId);
  if (!next) return { ok: false, status: 404, error: "Not found" };
  const analysis = next.analyses.find((item) => item.id === row.id);
  if (!analysis) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, workspace: next, analysis };
}

export async function recomputeAnalysisForUser(
  workspaceId: string,
  analysisId: string,
  userId: string
): Promise<
  | { ok: true; workspace: StatisticalWorkspaceView; analysis: StatisticalAnalysisSummary }
  | { ok: false; status: 400 | 404; error: string }
> {
  const workspace = await getWorkspaceForUser(workspaceId, userId);
  if (!workspace) return { ok: false, status: 404, error: "Not found" };
  const existing = workspace.analyses.find((item) => item.id === analysisId);
  if (!existing) return { ok: false, status: 404, error: "Not found" };

  const column = findColumn(workspace.worksheet, existing.config.columnId);
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
  const outcome = computeCapabilitySixpack(workspace.worksheet, config);
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
        eq(statisticalAnalyses.workspaceId, workspace.id)
      )
    );

  await db
    .update(statisticalWorkspaces)
    .set({ updatedAt: new Date() })
    .where(eq(statisticalWorkspaces.id, workspace.id));

  const next = await getWorkspaceForUser(workspaceId, userId);
  if (!next) return { ok: false, status: 404, error: "Not found" };
  const analysis = next.analyses.find((item) => item.id === analysisId);
  if (!analysis) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, workspace: next, analysis };
}

export async function deleteAnalysisForUser(
  workspaceId: string,
  analysisId: string,
  userId: string
): Promise<StatisticalWorkspaceView | null> {
  const workspace = await getWorkspaceForUser(workspaceId, userId);
  if (!workspace) return null;
  await db
    .delete(statisticalAnalyses)
    .where(
      and(
        eq(statisticalAnalyses.id, analysisId),
        eq(statisticalAnalyses.workspaceId, workspace.id)
      )
    );
  return getWorkspaceForUser(workspaceId, userId);
}
