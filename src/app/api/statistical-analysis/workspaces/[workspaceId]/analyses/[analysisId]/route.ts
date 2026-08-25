import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStatisticalAnalysisEnabled } from "@/lib/statistical-analysis/access";
import {
  deleteAnalysisForUser,
  recomputeAnalysisForUser,
} from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ workspaceId: string; analysisId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let action = "recompute";
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action) action = body.action;
  } catch {
    action = "recompute";
  }

  if (action !== "recompute") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const { workspaceId, analysisId } = await context.params;
  const result = await recomputeAnalysisForUser(workspaceId, analysisId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    workspace: result.workspace,
    analysis: result.analysis,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId, analysisId } = await context.params;
  const workspace = await deleteAnalysisForUser(workspaceId, analysisId, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ workspace });
}
