import { verifyPassword } from "@/lib/auth/password";

function previousPasswordCount(historyLimit: number): number {
  return Math.max(0, historyLimit - 1);
}

export function nextPasswordHistory({
  currentHistory,
  previousPasswordHash,
  historyLimit,
}: {
  currentHistory: string[];
  previousPasswordHash: string | null;
  historyLimit: number;
}): string[] {
  if (!previousPasswordHash) return currentHistory;

  const keepPrevious = previousPasswordCount(historyLimit);
  return [previousPasswordHash, ...currentHistory].slice(0, keepPrevious);
}

export async function isPasswordRecentlyUsed({
  password,
  currentPasswordHash,
  passwordHistory,
  historyLimit,
}: {
  password: string;
  currentPasswordHash: string | null;
  passwordHistory: string[];
  historyLimit: number;
}): Promise<boolean> {
  if (currentPasswordHash && (await verifyPassword(password, currentPasswordHash))) {
    return true;
  }

  const previousLimit = previousPasswordCount(historyLimit);
  if (previousLimit === 0) return false;

  for (const hash of passwordHistory.slice(0, previousLimit)) {
    if (await verifyPassword(password, hash)) return true;
  }

  return false;
}
