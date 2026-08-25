import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStatisticalAnalysisEnabled } from "@/lib/statistical-analysis/access";
import { createWorkspaceBodySchema } from "@/lib/statistical-analysis/schemas";
import {
  createWorkspaceForUser,
  listWorkspacesForUser,
} from "@/lib/statistical-analysis/store";

export async function GET() {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaces = await listWorkspacesForUser(user.id);
  return NextResponse.json({ workspaces });
}

export async function POST(request: Request) {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return disabled;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const parsed = createWorkspaceBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const workspace = await createWorkspaceForUser(user.id, parsed.data?.name);
  return NextResponse.json({ workspace }, { status: 201 });
}
