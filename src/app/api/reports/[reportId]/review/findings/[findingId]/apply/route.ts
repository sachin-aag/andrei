import { NextResponse } from "next/server";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { canSaveReportSection } from "@/lib/reports/access";
import { loadReviewRunContext } from "@/lib/review/server";
import {
  ApplyReviewFindingError,
  applyReviewFindingAsTrackedChange,
} from "@/lib/review/apply-finding";
import {
  aiBudgetExceededResponse,
  isAiBudgetExceededError,
} from "@/lib/ai/usage";
import {
  flushLangfuseTraces,
  observeRouteHandler,
} from "@/lib/observability/langfuse";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

export const maxDuration = 120;

export const POST = observeRouteHandler(
  "report-review-finding-apply",
  handlePost
);

async function handlePost(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; findingId: string }> }
) {
  const user = await getCurrentUser();
  const { reportId, findingId } = await params;
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!canSaveReportSection(access.user, access.report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  after(flushLangfuseTraces);

  try {
    const ctx = await loadReviewRunContext({
      report: access.report,
      user: access.user,
    });
    const result = await applyReviewFindingAsTrackedChange({
      ctx,
      findingId,
    });
    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "suggestion_generated",
      entityType: "suggestion",
      entityId: result.commentId,
      reportId,
      summary: "Applied a review finding as a tracked change",
      newValue: { findingId, commentId: result.commentId },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApplyReviewFindingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isAiBudgetExceededError(err)) {
      return aiBudgetExceededResponse(err);
    }
    throw err;
  }
}
