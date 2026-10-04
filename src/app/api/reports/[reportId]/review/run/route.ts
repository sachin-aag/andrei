import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { isReviewCategory, type ReviewCheckId } from "@/lib/review/ui";
import {
  checksForDocumentType,
  isKnownCheckId,
  loadReviewRunContext,
  runReviewChecks,
  buildReviewSnapshot,
} from "@/lib/review/server";
import {
  flushLangfuseTraces,
  observeRouteHandler,
} from "@/lib/observability/langfuse";
import {
  aiBudgetExceededResponse,
  isAiBudgetExceededError,
} from "@/lib/ai/usage";

export const maxDuration = 120;

const bodySchema = z.object({
  checkIds: z.array(z.string()).optional(),
  category: z.string().optional(),
});

export const POST = observeRouteHandler("report-review-run", handlePost);

async function handlePost(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const defs = checksForDocumentType(access.report.documentType).filter(
    (check) => check.kind === "run"
  );
  let requested = parsed.data.checkIds ?? [];
  if (parsed.data.category && isReviewCategory(parsed.data.category)) {
    requested = defs
      .filter((check) => check.category === parsed.data.category)
      .map((check) => check.id);
  }
  if (requested.length === 0) {
    requested = defs.map((check) => check.id);
  }

  const checkIds = requested.filter((id): id is ReviewCheckId =>
    isKnownCheckId(access.report.documentType, id)
  );
  if (checkIds.length === 0) {
    return NextResponse.json({ error: "No matching checks" }, { status: 400 });
  }

  after(flushLangfuseTraces);

  try {
    const result = await runReviewChecks({
      report: access.report,
      user: access.user,
      checkIds,
    });
    const ctx = await loadReviewRunContext({
      report: access.report,
      user: access.user,
    });
    const snapshot = await buildReviewSnapshot(ctx);
    return NextResponse.json({
      ...snapshot,
      ...result,
      comments: ctx.comments,
      evaluations: ctx.evaluations,
    });
  } catch (err) {
    if (isAiBudgetExceededError(err)) {
      return aiBudgetExceededResponse(err);
    }
    throw err;
  }
}
