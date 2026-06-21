import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
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
  if (response || !admin) return response;

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

  await recordAuditEvent({
    actor: auditActorFromUser(admin),
    action: "user_password_reset",
    entityType: "user",
    entityId: userId,
    summary: `Admin triggered password reset for ${targetUser.email}`,
    metadata: { email: targetUser.email },
  });

  return NextResponse.json({ ok: true, email: targetUser.email });
}
