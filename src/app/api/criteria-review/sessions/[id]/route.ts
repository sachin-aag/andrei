import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import {
  getCriteriaReviewSession,
  saveCriteriaReviewSession,
} from "@/lib/criteria-review/store";
import {
  humanAnswerKey,
  humanReviewerSchema,
  humanSubAnswerDraftSchema,
  humanSubAnswerSchema,
  validateHumanReview,
  type HumanSubAnswer,
} from "@/lib/criteria-review/human-judgment";
import type {
  CriteriaReviewForReviewer,
  CriteriaReviewSessionMetadata,
} from "@/lib/criteria-review/report-data";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const item = await getCriteriaReviewSession(decodeURIComponent(id));
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ session: item });
}

export async function PATCH(req: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCriteriaReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await req.json()) as {
    reviewer?: unknown;
    answer?: unknown;
    answers?: unknown;
    complete?: boolean;
  };

  const parsedReviewer = humanReviewerSchema.safeParse(body.reviewer);
  if (!parsedReviewer.success) {
    return NextResponse.json(
      {
        error: "Invalid reviewer payload",
        details: parsedReviewer.error.flatten(),
      },
      { status: 400 }
    );
  }

  const item = await getCriteriaReviewSession(decodeURIComponent(id));
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expectedAnswerKeys = item.input.sections.flatMap((section) =>
    section.criteria.map((criterion) => criterion.answerKey)
  );
  const reviewer = parsedReviewer.data;
  const existingReview = item.metadata.humanReviews?.[reviewer.id];
  const answers: CriteriaReviewForReviewer["answers"] = {
    ...(existingReview?.answers ?? {}),
  };

  const incomingAnswers = Array.isArray(body.answers)
    ? body.answers
    : body.answer
      ? [body.answer]
      : [];

  for (const incomingAnswer of incomingAnswers) {
    const parsedAnswer = humanSubAnswerDraftSchema.safeParse(incomingAnswer);
    if (!parsedAnswer.success) {
      return NextResponse.json(
        {
          error: "Invalid answer payload",
          details: parsedAnswer.error.flatten(),
        },
        { status: 400 }
      );
    }
    const answer = parsedAnswer.data;
    const key = humanAnswerKey(answer.section, answer.criterionKey);
    if (!expectedAnswerKeys.includes(key)) {
      return NextResponse.json(
        { error: `Unknown criterion for this report: ${key}` },
        { status: 400 }
      );
    }
    // Only validate individual answers as "complete" during final submission.
    // During draft auto-saves, answers may be in a valid intermediate state
    // (e.g. criteria agreement changed to "no" but suggestedStatus not yet set).
    if (body.complete) {
      const completeAnswer = humanSubAnswerSchema.safeParse(answer);
      if (completeAnswer.success) {
        const err = validateHumanReview([completeAnswer.data], [key]);
        if (err) {
          return NextResponse.json({ error: err }, { status: 400 });
        }
      }
    }
    answers[key] = answer;
  }

  const completeAnswers = Object.values(answers).filter(
    (answer): answer is HumanSubAnswer =>
      humanSubAnswerSchema.safeParse(answer).success
  );

  if (body.complete) {
    const validationError = validateHumanReview(
      completeAnswers,
      expectedAnswerKeys
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const hasAny = Object.values(answers).some(
    (answer) =>
      answer.criteriaEvaluationAgreement ||
      answer.reasoningAgreement ||
      answer.comment?.trim() ||
      answer.suggestedStatus
  );
  const reviewerStatus: CriteriaReviewForReviewer["status"] = body.complete
    ? "completed"
    : hasAny
      ? "in_progress"
      : "pending";
  const humanReviews = {
    ...(item.metadata.humanReviews ?? {}),
    [reviewer.id]: {
      reviewer,
      answers,
      reviewedAt: body.complete
        ? new Date().toISOString()
        : existingReview?.reviewedAt,
      status: reviewerStatus,
    },
  } satisfies NonNullable<typeof item.metadata.humanReviews>;
  const reviewStatuses = Object.values(humanReviews).map((review) => review.status);
  const humanReviewStatus: CriteriaReviewSessionMetadata["humanReviewStatus"] =
    reviewStatuses.includes("completed")
    ? "completed"
    : reviewStatuses.includes("in_progress")
      ? "in_progress"
      : "pending";
  const updated = {
    ...item,
    metadata: {
      ...item.metadata,
      humanReviews,
      humanReviewStatus,
    },
  };
  const saved = await saveCriteriaReviewSession(updated);

  return NextResponse.json({ session: saved });
}
