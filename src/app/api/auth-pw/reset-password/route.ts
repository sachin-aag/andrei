import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers, passwordResetTokens } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

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

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
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

  // Hash the new password and update the workspace user
  const newHash = await hashPassword(password);

  await db
    .update(workspaceUsers)
    .set({ passwordHash: newHash })
    .where(eq(workspaceUsers.email, normalizedEmail));

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, resetToken.id));

  return NextResponse.json({ ok: true });
}
