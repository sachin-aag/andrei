import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";
import { sendResetEmail } from "@/lib/auth/send-reset-email";

export async function sendPasswordResetLink(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await db.insert(passwordResetTokens).values({
    email: normalizedEmail,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await sendResetEmail(normalizedEmail, rawToken);
}
