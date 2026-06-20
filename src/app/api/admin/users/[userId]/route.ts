import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { USER_ROLES, defaultTitleForRole } from "@/lib/auth/roles";
import { adminUserFromRow } from "@/lib/admin/users";
import { getPasswordPolicy } from "@/lib/auth/password-policy";

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

  const policy = await getPasswordPolicy();
  return NextResponse.json({ user: adminUserFromRow(updated, policy) });
}
