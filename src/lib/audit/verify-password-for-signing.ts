import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";

export async function verifyPasswordForSigning(
  workspaceUserId: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password.trim()) {
    return { ok: false, error: "Password is required to sign." };
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: { passwordHash: true, lockedAt: true },
  });

  if (!wsUser?.passwordHash) {
    return {
      ok: false,
      error: "This account cannot sign with a password.",
    };
  }

  if (wsUser.lockedAt) {
    return { ok: false, error: "Account is locked." };
  }

  const valid = await verifyPassword(password, wsUser.passwordHash);
  if (!valid) {
    return { ok: false, error: "Incorrect password." };
  }

  return { ok: true };
}
