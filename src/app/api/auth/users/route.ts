import { NextResponse } from "next/server";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";

export async function GET() {
  try {
    const users = await listWorkspaceUsers();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "Could not load users." },
      { status: 500 }
    );
  }
}
