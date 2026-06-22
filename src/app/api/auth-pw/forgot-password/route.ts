import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
import { auditActorFromId, recordAuditEvent } from "@/lib/audit";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email || typeof email !== "string") {
    return NextResponse.json({ ok: true }); // anti-enumeration
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Always return 200 regardless of whether the email exists (anti-enumeration)
  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, normalizedEmail),
      columns: { id: true, name: true },
    });

    if (wsUser) {
      await sendPasswordResetLink(normalizedEmail);
      await recordAuditEvent({
        actor: auditActorFromId(wsUser.id, wsUser.name),
        action: "auth_password_reset",
        entityType: "auth",
        entityId: wsUser.id,
        summary: "Password reset link requested",
        metadata: { stage: "requested" },
      });
    }
  } catch (err) {
    // Log but don't leak info to the client
    console.error("forgot-password error:", err);
  }

  return NextResponse.json({ ok: true });
}
