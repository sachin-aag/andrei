import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  checkImproveAiSessionStale,
  createImproveAiSession,
  findImproveAiSessionForReport,
  rerunImproveAiSession,
} from "@/lib/improve-ai/store";
import { ImproveAiEvaluationError } from "@/lib/improve-ai/evaluate-report";

export const maxDuration = 120;

const bodySchema = z.object({
  reportId: z.string().min(1),
  confirmRerun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { reportId, confirmRerun } = parsed.data;

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.authorId !== user.id) {
    return NextResponse.json(
      { error: "Only the report author can submit it for AI feedback" },
      { status: 403 }
    );
  }

  const existing = await findImproveAiSessionForReport(reportId, user.id);
  if (existing) {
    if (existing.status === "evaluating") {
      return NextResponse.json({
        sessionId: existing.id,
        reportId,
        existing: true,
        stale: false,
        status: existing.status,
      });
    }

    const stale = await checkImproveAiSessionStale(existing.id, reportId);
    if (stale) {
      if (!confirmRerun) {
        return NextResponse.json({
          sessionId: existing.id,
          reportId,
          existing: true,
          stale: true,
          needsConfirmation: true,
          status: existing.status,
        });
      }

      try {
        const session = await rerunImproveAiSession(existing.id, user.id);
        return NextResponse.json({
          sessionId: session.id,
          reportId,
          existing: true,
          stale: true,
          rerun: true,
          status: session.status,
        });
      } catch (e) {
        if (e instanceof ImproveAiEvaluationError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        const message = e instanceof Error ? e.message : "Evaluation failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({
      sessionId: existing.id,
      reportId,
      existing: true,
      stale: false,
      status: existing.status,
    });
  }

  try {
    const session = await createImproveAiSession({
      reportId,
      userId: user.id,
      sourceType: "existing_report",
      sourceLabel: report.deviationNo,
      runEvaluation: true,
    });

    return NextResponse.json({
      sessionId: session.id,
      reportId,
      existing: false,
      status: session.status,
    });
  } catch (e) {
    if (e instanceof ImproveAiEvaluationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Evaluation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
