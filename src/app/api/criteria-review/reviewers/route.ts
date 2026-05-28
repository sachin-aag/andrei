import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import { listCriteriaReviewReviewers } from "@/lib/criteria-review/reviewers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviewers = await listCriteriaReviewReviewers();
  return NextResponse.json({ reviewers });
}
