import { verifyPassword } from "@/lib/auth/password";

/**
 * Recent password hashes for reuse checks — current first, max `historyLimit`.
 * Stored `password_history` uses the same shape (index 0 is the active hash).
 */
export function recentPasswordHashes({
  currentPasswordHash,
  passwordHistory,
  historyLimit,
}: {
  currentPasswordHash: string | null;
  passwordHistory: string[];
  historyLimit: number;
}): string[] {
  if (passwordHistory.length > 0) {
    if (!currentPasswordHash || passwordHistory[0] === currentPasswordHash) {
      return passwordHistory.slice(0, historyLimit);
    }
    // Legacy rows where history excluded the active hash.
    return [currentPasswordHash, ...passwordHistory].slice(0, historyLimit);
  }

  return currentPasswordHash ? [currentPasswordHash].slice(0, historyLimit) : [];
}

/** History after a password change — new hash first (includes current), max `historyLimit`. */
export function nextPasswordHistory({
  newPasswordHash,
  currentHistory,
  previousPasswordHash,
  historyLimit,
}: {
  newPasswordHash: string;
  currentHistory: string[];
  previousPasswordHash: string | null;
  historyLimit: number;
}): string[] {
  const recentPrior = recentPasswordHashes({
    currentPasswordHash: previousPasswordHash,
    passwordHistory: currentHistory,
    historyLimit,
  });
  return [newPasswordHash, ...recentPrior].slice(0, historyLimit);
}

export function initialPasswordHistory(
  passwordHash: string,
  historyLimit: number
): string[] {
  return [passwordHash].slice(0, historyLimit);
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
  const hashes = recentPasswordHashes({
    currentPasswordHash,
    passwordHistory,
    historyLimit,
  });

  for (const hash of hashes) {
    if (await verifyPassword(password, hash)) return true;
  }

  return false;
}
