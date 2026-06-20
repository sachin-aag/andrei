import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers, passwordResetTokens } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isPasswordRecentlyUsed, recordPasswordHistory } from "@/lib/auth/password-history";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

export async function POST(req: Request) {
  const { token, email, password } = (await req.json()) as {
    token?: string;
    email?: string;
    password?: string;
  };

  if (!token || !email || !password) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 },
    );
  }

  const policy = await getPasswordPolicy();
  const validation = validatePasswordPolicy(password, policy);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors.join(" ") },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Find a matching, unexpired, unused token
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.email, normalizedEmail),
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
    ),
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This link is invalid or expired. Please request a new one." },
      { status: 400 },
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, normalizedEmail),
    columns: { id: true, passwordHash: true },
  });
  if (!wsUser) {
    return NextResponse.json(
      { error: "This link is invalid or expired. Please request a new one." },
      { status: 400 },
    );
  }

  const reused = await isPasswordRecentlyUsed({
    userId: wsUser.id,
    password,
    currentPasswordHash: wsUser.passwordHash,
    historyLimit: policy.passwordHistoryLimit,
  });
  if (reused) {
    return NextResponse.json(
      { error: "Choose a password you have not used recently." },
      { status: 400 },
    );
  }

  // Hash the new password and update the workspace user
  const newHash = await hashPassword(password);
  const changedAt = new Date();

  await db
    .update(workspaceUsers)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      failedLoginAttempts: 0,
      lockedAt: null,
      passwordExpiryWarningDismissedUntil: null,
    })
    .where(eq(workspaceUsers.id, wsUser.id));
  await recordPasswordHistory({
    userId: wsUser.id,
    previousPasswordHash: wsUser.passwordHash,
    historyLimit: policy.passwordHistoryLimit,
  });

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, resetToken.id));

  return NextResponse.json({ ok: true });
}
