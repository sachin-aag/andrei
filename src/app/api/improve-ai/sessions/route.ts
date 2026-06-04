import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listImproveAiSessionsForUser } from "@/lib/improve-ai/store";
import { improveAiReviewProgress } from "@/lib/improve-ai/session-view";
import { getImproveAiSessionView } from "@/lib/improve-ai/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listImproveAiSessionsForUser(user.id);
  const sessions = await Promise.all(
    items.map(async (item) => {
      const view = await getImproveAiSessionView(item.id, user.id);
      const progress = view
        ? improveAiReviewProgress(view)
        : { answered: 0, total: 0 };
      return {
        ...item,
        answeredCount: progress.answered,
        criterionCount: progress.total,
      };
    })
  );

  return NextResponse.json({ sessions });
}
