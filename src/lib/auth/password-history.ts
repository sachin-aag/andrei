import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { passwordHistory } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";

function previousPasswordCount(historyLimit: number): number {
  return Math.max(0, historyLimit - 1);
}

export async function isPasswordRecentlyUsed({
  userId,
  password,
  currentPasswordHash,
  historyLimit,
}: {
  userId: string;
  password: string;
  currentPasswordHash: string | null;
  historyLimit: number;
}): Promise<boolean> {
  if (currentPasswordHash && (await verifyPassword(password, currentPasswordHash))) {
    return true;
  }

  const previousLimit = previousPasswordCount(historyLimit);
  if (previousLimit === 0) return false;

  const rows = await db.query.passwordHistory.findMany({
    where: eq(passwordHistory.userId, userId),
    orderBy: [desc(passwordHistory.createdAt)],
    limit: previousLimit,
  });

  for (const row of rows) {
    if (await verifyPassword(password, row.passwordHash)) return true;
  }

  return false;
}

export async function recordPasswordHistory({
  userId,
  previousPasswordHash,
  historyLimit,
}: {
  userId: string;
  previousPasswordHash: string | null;
  historyLimit: number;
}) {
  if (previousPasswordHash) {
    await db.insert(passwordHistory).values({
      userId,
      passwordHash: previousPasswordHash,
    });
  }

  const keepPrevious = previousPasswordCount(historyLimit);
  const rows = await db.query.passwordHistory.findMany({
    where: eq(passwordHistory.userId, userId),
    orderBy: [desc(passwordHistory.createdAt)],
  });
  const staleIds = rows.slice(keepPrevious).map((row) => row.id);
  if (staleIds.length > 0) {
    await db.delete(passwordHistory).where(inArray(passwordHistory.id, staleIds));
  }
}
