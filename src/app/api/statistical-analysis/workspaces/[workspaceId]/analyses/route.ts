import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStatisticalAnalysisEnabled } from "@/lib/statistical-analysis/access";
import { createAnalysisForUser } from "@/lib/statistical-analysis/store";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workspaceId } = await context.params;
  const result = await createAnalysisForUser(workspaceId, user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { workspace: result.workspace, analysis: result.analysis },
    { status: 201 }
  );
}
