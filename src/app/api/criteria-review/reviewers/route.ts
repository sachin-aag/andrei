import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import {
  createCriteriaReviewReviewer,
  listCriteriaReviewReviewers,
} from "@/lib/criteria-review/reviewers";

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

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: unknown;
    employeeId?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";

  if (!name || !employeeId) {
    return NextResponse.json(
      { error: "Reviewer name and employee ID are required." },
      { status: 400 }
    );
  }

  const reviewer = await createCriteriaReviewReviewer({ name, employeeId });
  return NextResponse.json({ reviewer });
}
