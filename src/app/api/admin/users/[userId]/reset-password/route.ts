import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage users" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResponse = await requireAdmin();
  if (authResponse) return authResponse;

  const { userId } = await params;
  const targetUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, userId),
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await sendPasswordResetLink(targetUser.email);
  } catch {
    return NextResponse.json(
      { error: "Could not send reset email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email: targetUser.email });
}
