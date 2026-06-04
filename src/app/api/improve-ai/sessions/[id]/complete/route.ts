import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { completeImproveAiSession } from "@/lib/improve-ai/store";
import { ImproveAiEvaluationError } from "@/lib/improve-ai/evaluate-report";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await completeImproveAiSession(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ImproveAiEvaluationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Failed to complete session" }, { status: 500 });
  }
}
