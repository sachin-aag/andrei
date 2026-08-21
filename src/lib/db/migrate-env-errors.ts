/** Postgres SQLSTATE for invalid password / role. */
export const POSTGRES_INVALID_PASSWORD = "28P01";

export function isPostgresPasswordAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === POSTGRES_INVALID_PASSWORD) {
    return true;
  }
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return /password authentication failed/i.test(message);
}

export function missingPreviewDatabaseUrlMessage(input: {
  branch: string;
}): string {
  return (
    "DATABASE_URL is not set for this Vercel Preview deployment.\n" +
    `Branch: ${input.branch}\n` +
    "Set a shared Preview DATABASE_URL (pooled Neon URL) on this Vercel project.\n" +
    'Do not enable "Create a branch for each preview deployment" on andrei-v2, andrei-demo, or andrei-convergent — those inject per-git-branch passwords that go stale (28P01).\n' +
    "See docs/whitelabel-vercel-deploy.md § Deploy scope."
  );
}

export function postgresPasswordAuthFailedMessage(input: {
  host: string;
  vercelEnv: string;
  deployScope: string | undefined;
}): string {
  const scope = input.deployScope?.trim() || "unset";
  return (
    "Postgres rejected DATABASE_URL (28P01 password authentication failed).\n" +
    `vercel (${input.vercelEnv})  →  ${input.host}\n` +
    `ANDREI_VERCEL_DEPLOY_SCOPE=${scope}\n` +
    "This is a stale Neon credential, not an application compile error.\n" +
    "On andrei-v2 / andrei-demo / andrei-convergent: turn OFF\n" +
    '  "Create a branch for each preview deployment"\n' +
    "on the Vercel ↔ Neon integration. Do not hand-edit Neon-logo DATABASE_URL rows.\n" +
    "Point Preview DATABASE_URL at the shared pooled URL (dedicated preview DB for MJ — not production unless intentional).\n" +
    "Delete leftover Neon preview/… branches if needed.\n" +
    "See docs/whitelabel-vercel-deploy.md (Deploy scope + Troubleshooting)."
  );
}
