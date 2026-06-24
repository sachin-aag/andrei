import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { adminUserFromRow } from "@/lib/admin/users";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Only admins can manage users" },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const { userId } = await params;
  const [existing] = await db
    .select()
    .from(workspaceUsers)
    .where(eq(workspaceUsers.id, userId));

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(workspaceUsers)
    .set({ failedLoginAttempts: 0, lockedAt: null })
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (admin) {
    await recordAuditEvent({
      actor: auditActorFromUser(admin),
      action: "user_unlocked",
      entityType: "user",
      entityId: userId,
      summary: `Unlocked user ${updated.email}`,
      oldValue: {
        failedLoginAttempts: existing.failedLoginAttempts,
        lockedAt: existing.lockedAt,
      },
      newValue: { failedLoginAttempts: 0, lockedAt: null },
    });
  }

  return NextResponse.json({ user: adminUserFromRow(updated) });
}
