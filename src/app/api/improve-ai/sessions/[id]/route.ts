import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  completeImproveAiSession,
  getImproveAiSessionView,
  saveImproveAiFeedbackDraft,
} from "@/lib/improve-ai/store";
import { ImproveAiEvaluationError } from "@/lib/improve-ai/evaluate-report";
import {
  humanSubAnswerDraftSchema,
  humanSubAnswerSchema,
  validateHumanReview,
} from "@/lib/improve-ai/human-judgment";
import { improveAiAnswerKeys } from "@/lib/improve-ai/session-view";

const patchSchema = z.object({
  answers: z.array(humanSubAnswerDraftSchema),
  complete: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const view = await getImproveAiSessionView(id, user.id);
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ session: view });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const view = await getImproveAiSessionView(id, user.id);
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { answers, complete } = parsed.data;
  const expectedKeys = improveAiAnswerKeys(view);

  if (complete) {
    const completeAnswers = answers.flatMap((draft) => {
      const result = humanSubAnswerSchema.safeParse(draft);
      return result.success ? [result.data] : [];
    });
    const validationError = validateHumanReview(completeAnswers, expectedKeys);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  try {
    await saveImproveAiFeedbackDraft(id, user.id, answers);
    if (complete) {
      await completeImproveAiSession(id, user.id);
    }
    const updated = await getImproveAiSessionView(id, user.id);
    return NextResponse.json({ session: updated });
  } catch (e) {
    if (e instanceof ImproveAiEvaluationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
