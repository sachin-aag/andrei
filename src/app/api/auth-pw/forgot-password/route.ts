import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
import { PASSWORD_RESET_SEND_ERROR } from "@/lib/auth/password-reset-messages";
import { auditActorFromId, recordAuditEvent } from "@/lib/audit";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email || typeof email !== "string") {
    return NextResponse.json({ ok: true }); // anti-enumeration
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, normalizedEmail),
      columns: { id: true, name: true, lockedAt: true, deactivatedAt: true },
    });

    // Locked accounts must still receive the email — completing reset clears
    // lockedAt. Deactivated accounts stay silent (same 200 as unknown emails).
    if (!wsUser || wsUser.deactivatedAt) {
      return NextResponse.json({ ok: true });
    }

    try {
      await sendPasswordResetLink(normalizedEmail);
      await recordAuditEvent({
        actor: auditActorFromId(wsUser.id, wsUser.name),
        action: "auth_password_reset",
        entityType: "auth",
        entityId: wsUser.id,
        summary: "Password reset link requested",
        metadata: { stage: "requested" },
      });
    } catch (err) {
      // Known account: do not pretend the email went out. Lock-screen and
      // forgot-password already know this address exists.
      console.error("forgot-password error:", err);
      try {
        await recordAuditEvent({
          actor: auditActorFromId(wsUser.id, wsUser.name),
          action: "auth_password_reset",
          entityType: "auth",
          entityId: wsUser.id,
          summary: "Password reset link failed to send",
          metadata: { stage: "send_failed" },
        });
      } catch (auditErr) {
        console.error("forgot-password audit failed:", auditErr);
      }
      return NextResponse.json(
        { ok: false, error: PASSWORD_RESET_SEND_ERROR },
        { status: 503 }
      );
    }
  } catch (err) {
    // Lookup failed — keep anti-enumeration for unknown/unreadable rows.
    console.error("forgot-password error:", err);
  }

  return NextResponse.json({ ok: true });
}
