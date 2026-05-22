import { NextResponse } from "next/server";
import { humanReviewerFromMockUser } from "@/lib/auth/reviewer-from-user";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import { listCriteriaReviewSessions } from "@/lib/criteria-review/store";
import { reviewerProgress } from "@/lib/criteria-review/report-data";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const items = await listCriteriaReviewSessions();
  const reviewerId = humanReviewerFromMockUser(user).id;
  const sessions = items.map((item) => {
    const { answered, total, status } = reviewerProgress(item, reviewerId);
    return {
      id: item.id,
      deviationNo: item.input.deviationNo,
      sourceFile: item.input.sourceFile,
      sectionCount: item.input.sections.length,
      criterionCount: total,
      answeredCount: answered,
      humanReviewStatus: status,
      promptVersion: item.metadata.promptVersion,
    };
  });

  return NextResponse.json({ sessions });
}
