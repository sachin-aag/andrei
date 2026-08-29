import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsRevisions,
  statisticalWorkspaces,
  type DocumentRevisionSource,
} from "@/db/schema";
import { MANUAL_REVISION_IDLE_MS } from "@/lib/document-revisions/constants";
import type { ReportAnalyticsView } from "@/lib/statistical-analysis/types";
import {
  analyticsRevisionHash,
  analyticsRevisionPayload,
  type AnalyticsRevisionPayload,
} from "@/lib/analytics-revisions/payload";

export type AnalyticsRevisionRecord = typeof analyticsRevisions.$inferSelect;

export type AnalyticsRevisionKind = "worksheet" | "analysis";

export type CoalescedRevisionPlan =
  | { action: "skip" }
  | { action: "insert" }
  | { action: "replace"; revisionId: string };

export function planCoalescedRevision(args: {
  latest: {
    id: string;
    source: DocumentRevisionSource;
    kind: AnalyticsRevisionKind;
    updatedAt: Date;
    fingerprint: string;
  } | null;
  nextFingerprint: string;
  nextKind: AnalyticsRevisionKind;
  nextSource: DocumentRevisionSource;
  now: Date;
  idleMs?: number;
}): CoalescedRevisionPlan {
  if (args.latest && args.latest.fingerprint === args.nextFingerprint) {
    return { action: "skip" };
  }
  if (
    args.nextKind === "worksheet" &&
    args.latest?.kind === "worksheet" &&
    args.latest.source === args.nextSource &&
    args.now.getTime() - args.latest.updatedAt.getTime() <
      (args.idleMs ?? MANUAL_REVISION_IDLE_MS)
  ) {
    return { action: "replace", revisionId: args.latest.id };
  }
  return { action: "insert" };
}

export function mergeAnalyticsSummary(existing: string, next: string): string {
  if (!existing || existing === next) return next;
  return "Edited analytics";
}

function asRevisionKind(value: string): AnalyticsRevisionKind {
  return value === "analysis" ? "analysis" : "worksheet";
}

type RevisionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertRevision(
  tx: RevisionTx,
  args: {
    reportId: string;
    source: DocumentRevisionSource;
    kind: AnalyticsRevisionKind;
    summary: string;
    createdBy: string | null;
    payload: AnalyticsRevisionPayload;
    contentHash: string;
    now: Date;
  }
): Promise<AnalyticsRevisionRecord> {
  const [latest] = await tx
    .select({ revisionNo: analyticsRevisions.revisionNo })
    .from(analyticsRevisions)
    .where(eq(analyticsRevisions.reportId, args.reportId))
    .orderBy(desc(analyticsRevisions.revisionNo))
    .limit(1);

  const [revision] = await tx
    .insert(analyticsRevisions)
    .values({
      reportId: args.reportId,
      revisionNo: (latest?.revisionNo ?? 0) + 1,
      source: args.source,
      kind: args.kind,
      summary: args.summary,
      createdBy: args.createdBy,
      createdAt: args.now,
      updatedAt: args.now,
      worksheet: args.payload.worksheet,
      analyses: args.payload.analyses,
      contentHash: args.contentHash,
    })
    .returning();
  if (!revision) {
    throw new Error("Failed to create analytics revision.");
  }
  return revision;
}

export async function recordAnalyticsRevision(args: {
  reportId: string;
  analytics: ReportAnalyticsView;
  source: DocumentRevisionSource;
  kind: AnalyticsRevisionKind;
  createdBy: string | null;
  summary: string;
  now?: Date;
  idleMs?: number;
}): Promise<AnalyticsRevisionRecord | null> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select({ id: statisticalWorkspaces.id })
      .from(statisticalWorkspaces)
      .where(eq(statisticalWorkspaces.reportId, args.reportId))
      .for("update");
    if (!workspace) return null;

    const payload = analyticsRevisionPayload({
      worksheet: args.analytics.worksheet,
      analyses: args.analytics.analyses,
    });
    const nextHash = analyticsRevisionHash(payload);
    const now = args.now ?? new Date();

    const [latest] = await tx
      .select({
        id: analyticsRevisions.id,
        source: analyticsRevisions.source,
        kind: analyticsRevisions.kind,
        updatedAt: analyticsRevisions.updatedAt,
        summary: analyticsRevisions.summary,
        contentHash: analyticsRevisions.contentHash,
      })
      .from(analyticsRevisions)
      .where(eq(analyticsRevisions.reportId, args.reportId))
      .orderBy(desc(analyticsRevisions.revisionNo))
      .limit(1);

    const plan = planCoalescedRevision({
      latest: latest
        ? {
            id: latest.id,
            source: latest.source,
            kind: asRevisionKind(latest.kind),
            updatedAt: latest.updatedAt,
            fingerprint: latest.contentHash,
          }
        : null,
      nextFingerprint: nextHash,
      nextKind: args.kind,
      nextSource: args.source,
      now,
      idleMs: args.idleMs,
    });

    switch (plan.action) {
      case "skip":
        return null;
      case "insert":
        return insertRevision(tx, {
          reportId: args.reportId,
          source: args.source,
          kind: args.kind,
          summary: args.summary,
          createdBy: args.createdBy,
          payload,
          contentHash: nextHash,
          now,
        });
      case "replace": {
        const [updated] = await tx
          .update(analyticsRevisions)
          .set({
            summary: mergeAnalyticsSummary(latest?.summary ?? "", args.summary),
            createdBy: args.createdBy,
            updatedAt: now,
            worksheet: payload.worksheet,
            analyses: payload.analyses,
            contentHash: nextHash,
          })
          .where(eq(analyticsRevisions.id, plan.revisionId))
          .returning();
        if (!updated) {
          throw new Error("Failed to update analytics revision.");
        }
        return updated;
      }
      default: {
        const exhaustive: never = plan;
        return exhaustive;
      }
    }
  });
}

export async function tryRecordAnalyticsRevision(
  args: Parameters<typeof recordAnalyticsRevision>[0]
): Promise<AnalyticsRevisionRecord | null> {
  try {
    return await recordAnalyticsRevision(args);
  } catch (err) {
    console.error("analytics-revisions: failed to record revision", err);
    return null;
  }
}
