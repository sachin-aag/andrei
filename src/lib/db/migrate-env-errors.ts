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
    'Enable "Create a branch for each preview deployment" on the Vercel ↔ Neon integration so Neon injects a per-git-branch DATABASE_URL.\n' +
    "If preview branching is already on, redeploy — the first compile can race the inject.\n" +
    "See docs/neon-vercel-setup.md."
  );
}

export function postgresPasswordAuthFailedMessage(input: {
  host: string;
  vercelEnv: string;
  deployScope: string | undefined;
  gitBranch?: string;
}): string {
  const scope = input.deployScope?.trim() || "unset";
  const gitBranch = input.gitBranch?.trim() || "(unknown branch)";
  return (
    "Postgres rejected DATABASE_URL (28P01 password authentication failed).\n" +
    `vercel (${input.vercelEnv})  →  ${input.host}\n` +
    `ANDREI_VERCEL_DEPLOY_SCOPE=${scope}\n` +
    `Git branch: ${gitBranch}\n` +
    "This is a stale Neon preview-branch password, not an application compile error.\n" +
    'Keep "Create a branch for each preview deployment" ON.\n' +
    "Do not hand-edit Neon-logo DATABASE_URL rows.\n" +
    `Delete the Neon branch preview/${gitBranch} (and any leftover preview/… for this ref), then redeploy so Neon injects a fresh password.\n` +
    "See docs/neon-vercel-setup.md."
  );
}
