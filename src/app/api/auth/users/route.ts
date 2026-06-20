import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await listWorkspaceUsers();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "Could not load users." },
      { status: 500 }
    );
  }
}
