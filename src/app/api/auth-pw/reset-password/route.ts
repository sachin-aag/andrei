import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  isPasswordRecentlyUsed,
  nextPasswordHistory,
} from "@/lib/auth/password-history";
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
  const validation = validatePasswordPolicy(password);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors.join(" ") },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, normalizedEmail),
    columns: {
      id: true,
      passwordHash: true,
      passwordHistory: true,
      passwordResetTokenHash: true,
      passwordResetTokenExpiresAt: true,
    },
  });

  if (
    !wsUser?.passwordResetTokenHash ||
    wsUser.passwordResetTokenHash !== tokenHash ||
    !wsUser.passwordResetTokenExpiresAt ||
    wsUser.passwordResetTokenExpiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "This link is invalid or expired. Please request a new one." },
      { status: 400 },
    );
  }

  const reused = await isPasswordRecentlyUsed({
    password,
    currentPasswordHash: wsUser.passwordHash,
    passwordHistory: wsUser.passwordHistory,
    historyLimit: policy.passwordHistoryLimit,
  });
  if (reused) {
    return NextResponse.json(
      { error: "Choose a password you have not used recently." },
      { status: 400 },
    );
  }

  const newHash = await hashPassword(password);
  const changedAt = new Date();
  const updatedHistory = nextPasswordHistory({
    currentHistory: wsUser.passwordHistory,
    previousPasswordHash: wsUser.passwordHash,
    historyLimit: policy.passwordHistoryLimit,
  });

  await db
    .update(workspaceUsers)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      failedLoginAttempts: 0,
      lockedAt: null,
      passwordExpiryWarningDismissedUntil: null,
      passwordHistory: updatedHistory,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      passwordResetTokenCreatedAt: null,
    })
    .where(eq(workspaceUsers.id, wsUser.id));

  return NextResponse.json({ ok: true });
}
