import {
  isPostgresPasswordAuthError,
  missingPreviewDatabaseUrlMessage,
  postgresPasswordAuthFailedMessage,
} from "@/lib/db/migrate-env-errors";
import {
  recoverStaleNeonPreviewOnAuthFailure,
  staleNeonPreviewRecoveryLogLines,
} from "@/lib/db/recover-stale-neon-preview";

export function databaseHost(dbUrl: string): string {
  try {
    return new URL(dbUrl).host;
  } catch {
    return "(invalid URL)";
  }
}

export function resolveDatabaseUrlFromEnv(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

export function loadDatabaseUrlOrExit(): string {
  const url = resolveDatabaseUrlFromEnv();
  if (url) return url;

  const onVercel = Boolean(process.env.VERCEL);
  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "(unknown branch)";

  if (onVercel && vercelEnv === "preview") {
    console.error(missingPreviewDatabaseUrlMessage({ branch }));
  } else {
    console.error(
      "DATABASE_URL is not set. On Vercel, ensure the Neon integration is connected. Locally, use .env.local or .env."
    );
  }
  process.exit(1);
}

export async function handleDatabaseScriptAuthFailure(
  error: unknown,
  databaseUrl: string
): Promise<void> {
  if (!isPostgresPasswordAuthError(error)) {
    return;
  }

  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const onVercelPreview = Boolean(process.env.VERCEL) && vercelEnv === "preview";

  if (onVercelPreview) {
    const recovery = await recoverStaleNeonPreviewOnAuthFailure({
      gitRef: process.env.VERCEL_GIT_COMMIT_REF,
      prNumber: process.env.VERCEL_GIT_PULL_REQUEST_ID,
    });
    for (const line of staleNeonPreviewRecoveryLogLines(recovery)) {
      console.error(line);
    }
  }

  console.error(
    postgresPasswordAuthFailedMessage({
      host: databaseHost(databaseUrl),
      vercelEnv,
      deployScope: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
      autoHealAttempted: onVercelPreview,
    })
  );
}
