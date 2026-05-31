import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers, passwordResetTokens } from "@/db/schema";
import { sendResetEmail } from "@/lib/auth/send-reset-email";

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
    });

    if (wsUser) {
      // Generate a random token, store its SHA-256 hash
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await db.insert(passwordResetTokens).values({
        email: normalizedEmail,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      await sendResetEmail(normalizedEmail, rawToken);
    }
  } catch (err) {
    // Log but don't leak info to the client
    console.error("forgot-password error:", err);
  }

  return NextResponse.json({ ok: true });
}
