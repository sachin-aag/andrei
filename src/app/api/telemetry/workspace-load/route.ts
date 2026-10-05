import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isWorkspaceLoadTelemetryEnabled,
  WORKSPACE_LOAD_TELEMETRY_MAX_BYTES,
  workspaceLoadTelemetrySchema,
} from "@/lib/workspace-load-telemetry";

export async function POST(req: Request) {
  if (!isWorkspaceLoadTelemetryEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > WORKSPACE_LOAD_TELEMETRY_MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = workspaceLoadTelemetrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.info("[wl]", parsed.data);
  return NextResponse.json({ ok: true });
}
