import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { USER_ROLES, defaultTitleForRole } from "@/lib/auth/roles";
import { adminUserFromRow, findWorkspaceUserByEmail } from "@/lib/admin/users";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  active: z.boolean().optional(),
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

  if (
    admin?.id === userId &&
    parsed.data.role !== undefined &&
    parsed.data.role !== "admin"
  ) {
    return NextResponse.json(
      { error: "Admins cannot remove their own admin role." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(workspaceUsers)
    .where(eq(workspaceUsers.id, userId));

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updates: Partial<typeof workspaceUsers.$inferInsert> = {};

  if (parsed.data.role !== undefined) {
    updates.role = parsed.data.role;
    updates.title = defaultTitleForRole(parsed.data.role);
  }
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.toLowerCase();
    if (email !== existing.email) {
      const taken = await findWorkspaceUserByEmail(email);
      if (taken && taken.id !== userId) {
        return NextResponse.json(
          {
            error: taken.deactivatedAt
              ? "This email belongs to a retired user and cannot be reused."
              : "A user with this email already exists.",
          },
          { status: 409 }
        );
      }
      updates.email = email;
    }
  }
  if (parsed.data.active !== undefined) {
    updates.deactivatedAt = parsed.data.active ? null : new Date();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ user: adminUserFromRow(existing) });
  }

  const [updated] = await db
    .update(workspaceUsers)
    .set(updates)
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (admin) {
    if (parsed.data.active === false && !existing.deactivatedAt) {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "user_deactivated",
        entityType: "user",
        entityId: userId,
        summary: `Deactivated user ${updated.email}`,
        oldValue: { active: true },
        newValue: { active: false, deactivatedAt: updated.deactivatedAt },
      });
    } else if (parsed.data.active === true && existing.deactivatedAt) {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "user_reactivated",
        entityType: "user",
        entityId: userId,
        summary: `Reactivated user ${updated.email}`,
        oldValue: { active: false },
        newValue: { active: true },
      });
    } else {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "user_updated",
        entityType: "user",
        entityId: userId,
        summary: `Updated user ${updated.email}`,
        oldValue: {
          role: existing.role,
          title: existing.title,
          name: existing.name,
          email: existing.email,
        },
        newValue: {
          role: updated.role,
          title: updated.title,
          name: updated.name,
          email: updated.email,
        },
      });
    }
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
      { error: "Admins cannot deactivate their own account." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(workspaceUsers)
    .where(eq(workspaceUsers.id, userId));

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (existing.deactivatedAt) {
    return NextResponse.json({ ok: true });
  }

  const [updated] = await db
    .update(workspaceUsers)
    .set({ deactivatedAt: new Date() })
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (admin && updated) {
    await recordAuditEvent({
      actor: auditActorFromUser(admin),
      action: "user_deactivated",
      entityType: "user",
      entityId: userId,
      summary: `Deactivated user ${updated.email}`,
      oldValue: { active: true },
      newValue: { active: false },
    });
  }

  return NextResponse.json({ ok: true });
}
