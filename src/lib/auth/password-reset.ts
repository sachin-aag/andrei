import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { sendResetEmail } from "@/lib/auth/send-reset-email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function sendPasswordResetLink(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  await db
    .update(workspaceUsers)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    })
    .where(eq(workspaceUsers.email, normalizedEmail));

  await sendResetEmail(normalizedEmail, rawToken);
}
