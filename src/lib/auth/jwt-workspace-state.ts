export const JWT_WORKSPACE_STATE_TTL_MS = 60_000;

export type JwtWorkspaceStateToken = {
  workspaceUserId?: string;
  mustChangePassword?: boolean;
  passwordExpired?: boolean;
  jwtStateCheckedAt?: number;
  email?: unknown;
};

/**
 * JWT flags (`mustChangePassword`, `passwordExpired`, deactivation) are
 * stamped onto the token and reused until this TTL, so `auth()` in the
 * proxy does not hit Postgres on every navigation.
 *
 * Always refresh when:
 * - the user just signed in (`hasUser`)
 * - NextAuth `update()` ran
 * - the token still forces `/change-password` (so a successful password
 *   replace can clear the flag on the next request)
 * - the stamp is missing or older than the TTL
 */
export function shouldRefreshJwtWorkspaceState(
  token: JwtWorkspaceStateToken,
  opts: { hasUser: boolean; trigger?: string }
): boolean {
  if (opts.hasUser) return true;
  if (opts.trigger === "update") return true;
  if (token.mustChangePassword === true || token.passwordExpired === true) {
    return true;
  }
  const hasIdentity =
    typeof token.workspaceUserId === "string" ||
    typeof token.email === "string";
  if (!hasIdentity) return false;
  const checkedAt = token.jwtStateCheckedAt;
  if (typeof checkedAt !== "number") return true;
  return Date.now() - checkedAt >= JWT_WORKSPACE_STATE_TTL_MS;
}

export function stampJwtWorkspaceStateCheckedAt(
  token: { jwtStateCheckedAt?: number },
  now = Date.now()
): void {
  token.jwtStateCheckedAt = now;
}
