import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isPasswordRecentlyUsed, nextPasswordHistory } from "@/lib/auth/password-history";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

export async function POST(req: Request) {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, password, confirmPassword } = (await req.json()) as {
    currentPassword?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!currentPassword || !password || !confirmPassword) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 }
    );
  }

  const policy = await getPasswordPolicy();
  const validation = validatePasswordPolicy(password);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors.join(" ") },
      { status: 400 }
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: { id: true, passwordHash: true, passwordHistory: true },
  });
  if (!wsUser?.passwordHash) {
    return NextResponse.json(
      { error: "This account does not have a password to change." },
      { status: 400 }
    );
  }

  const currentPasswordValid = await verifyPassword(
    currentPassword,
    wsUser.passwordHash
  );
  if (!currentPasswordValid) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
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
      { status: 400 }
    );
  }

  const newHash = await hashPassword(password);
  const changedAt = new Date();
  const updatedHistory = nextPasswordHistory({
    newPasswordHash: newHash,
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
    })
    .where(eq(workspaceUsers.id, wsUser.id));

  return NextResponse.json({ ok: true });
}
