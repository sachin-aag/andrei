import type { AuditAction, DocumentRevisionSource } from "@/db/schema";
import { recordAuditEvent, type AuditActorSnapshot } from "@/lib/audit";
import { tryRecordAnalyticsRevision } from "@/lib/analytics-revisions/snapshot";
import type { ReportAnalyticsView } from "@/lib/statistical-analysis/types";

export type AnalyticsAuditAction =
  | "worksheet_updated"
  | "analysis_created"
  | "analysis_updated"
  | "analysis_deleted";

export async function recordAnalyticsChange(args: {
  reportId: string;
  analytics: ReportAnalyticsView;
  actor: AuditActorSnapshot;
  action: AnalyticsAuditAction;
  summary: string;
  entityId: string;
  historySource: DocumentRevisionSource;
  historySummary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const kind = args.action === "worksheet_updated" ? "worksheet" : "analysis";
  const revision = await tryRecordAnalyticsRevision({
    reportId: args.reportId,
    analytics: args.analytics,
    source: args.historySource,
    kind,
    createdBy: args.actor.id,
    summary: args.historySummary,
  });
  if (revision === null && args.action === "worksheet_updated") {
    return;
  }
  try {
    await recordAuditEvent({
      actor: args.actor,
      action: args.action,
      entityType: "analytics",
      entityId: args.entityId,
      reportId: args.reportId,
      summary: args.summary,
      newValue: {
        revisionNo: revision?.revisionNo ?? null,
        contentHash: revision?.contentHash ?? null,
      },
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.error("analytics-revisions: failed to record audit event", err);
  }
}

export async function tryRecordAnalyticsChange(
  args: Parameters<typeof recordAnalyticsChange>[0]
): Promise<void> {
  try {
    await recordAnalyticsChange(args);
  } catch (err) {
    console.error("analytics-revisions: failed to record change", err);
  }
}

export function isAnalyticsAuditAction(
  action: AuditAction
): action is AnalyticsAuditAction {
  switch (action) {
    case "worksheet_updated":
    case "analysis_created":
    case "analysis_updated":
    case "analysis_deleted":
      return true;
    default:
      return false;
  }
}
