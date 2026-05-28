import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
    email?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Reviewer name is required." },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json(
      { error: "Reviewer email is required." },
      { status: 400 }
    );
  }

  try {
    const reviewer = await createCriteriaReviewReviewer({ name, email });
    return NextResponse.json({ reviewer });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }
    throw error;
  }
}
