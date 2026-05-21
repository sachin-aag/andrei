import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import {
  isLangfuseConfigured,
  listCriteriaReviewSessions,
} from "@/lib/langfuse/client";
import { sessionProgress } from "@/lib/langfuse/criteria-dataset";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isLangfuseConfigured()) {
    return NextResponse.json(
      { error: "Langfuse is not configured on this server." },
      { status: 503 }
    );
  }

  const items = await listCriteriaReviewSessions();
  const sessions = items.map((item) => {
    const { answered, total, status, reviewerCount } = sessionProgress(item);
    return {
      id: item.id,
      deviationNo: item.input.deviationNo,
      sourceFile: item.input.sourceFile,
      sectionCount: item.input.sections.length,
      criterionCount: total,
      answeredCount: answered,
      humanReviewStatus: status,
      reviewerCount,
      promptVersion: item.metadata.promptVersion,
    };
  });

  return NextResponse.json({ sessions });
}
