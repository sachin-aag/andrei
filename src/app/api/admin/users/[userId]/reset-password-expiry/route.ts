import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { adminUserFromRow } from "@/lib/admin/users";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { getCurrentUser } from "@/lib/auth/session";

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

  if (!targetUser.passwordHash) {
    return NextResponse.json(
      { error: "User does not have a password set." },
      { status: 400 }
    );
  }

  if (targetUser.mustChangePassword) {
    return NextResponse.json(
      { error: "User must choose a password before expiry can be reset." },
      { status: 400 }
    );
  }

  const changedAt = new Date();
  const [updated] = await db
    .update(workspaceUsers)
    .set({
      passwordChangedAt: changedAt,
      passwordExpiryWarningDismissedUntil: null,
    })
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const policy = await getPasswordPolicy();
  return NextResponse.json({ user: adminUserFromRow(updated, policy) });
}
