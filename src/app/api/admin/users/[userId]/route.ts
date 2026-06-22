import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { USER_ROLES, defaultTitleForRole } from "@/lib/auth/roles";
import { adminUserFromRow } from "@/lib/admin/users";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

const updateUserSchema = z.object({
  role: z.enum(USER_ROLES),
});

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const { userId } = await params;
  const parsed = updateUserSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (admin?.id === userId && parsed.data.role !== "admin") {
    return NextResponse.json(
      { error: "Admins cannot remove their own admin role." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(workspaceUsers)
    .where(eq(workspaceUsers.id, userId));

  const [updated] = await db
    .update(workspaceUsers)
    .set({
      role: parsed.data.role,
      title: defaultTitleForRole(parsed.data.role),
    })
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (admin && existing) {
    await recordAuditEvent({
      actor: auditActorFromUser(admin),
      action: "user_updated",
      entityType: "user",
      entityId: userId,
      summary: `Updated role for ${updated.email}`,
      oldValue: { role: existing.role, title: existing.title },
      newValue: { role: updated.role, title: updated.title },
    });
  }

  return NextResponse.json({ user: adminUserFromRow(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const { userId } = await params;
  if (admin?.id === userId) {
    return NextResponse.json(
      { error: "Admins cannot delete their own account." },
      { status: 400 }
    );
  }

  const [deleted] = await db
    .delete(workspaceUsers)
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.delete(authUsers).where(eq(authUsers.email, deleted.email));

  return NextResponse.json({ ok: true });
}
