import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStatisticalAnalysisEnabled } from "@/lib/statistical-analysis/access";
import { patchWorkspaceBodySchema } from "@/lib/statistical-analysis/schemas";
import {
  deleteWorkspaceForUser,
  getWorkspaceForUser,
  updateWorkspaceForUser,
} from "@/lib/statistical-analysis/store";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await context.params;
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ workspace });
}

export async function PATCH(request: Request, context: RouteContext) {
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
  const parsed = patchWorkspaceBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { workspaceId } = await context.params;
  const workspace = await updateWorkspaceForUser(workspaceId, user.id, parsed.data);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ workspace });
}

/** Keepalive / sendBeacon from `useAutoSave` posts the same JSON as PATCH. */
export { PATCH as POST };

export async function DELETE(_request: Request, context: RouteContext) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await context.params;
  const deleted = await deleteWorkspaceForUser(workspaceId, user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
