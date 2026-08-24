/**
 * Upserts Aditya as a hidden manager and assigns him to every live report.
 * Runs on every Vercel deploy (demo, MJ, Convergent).
 *
 *   pnpm db:ensure-hidden-expert
 *   pnpm db:ensure-hidden-expert -- --prod
 */
import { config } from "dotenv";
import {
  isPostgresPasswordAuthError,
  missingPreviewDatabaseUrlMessage,
  postgresPasswordAuthFailedMessage,
} from "@/lib/db/migrate-env-errors";
import { assignHiddenExpertReviewerToAllReports } from "@/lib/reports/ensure-hidden-expert-reviewer";

const isProd = process.argv.includes("--prod");

// Vercel/Neon inject DATABASE_URL per deployment; do not load local .env files over it.
if (!process.env.DATABASE_URL) {
  if (isProd) {
    config({ path: ".env" });
  } else {
    config({ path: ".env" });
    config({ path: ".env.local", override: true });
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
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

function databaseHost(dbUrl: string): string {
  try {
    return new URL(dbUrl).host;
  } catch {
    return "(invalid URL)";
  }
}

async function main() {
  const result = await assignHiddenExpertReviewerToAllReports();
  console.error(
    `Hidden expert reviewer ${result.expertId}: linked ${result.reportsLinked} report(s).`
  );
}

main().catch((e) => {
  if (isPostgresPasswordAuthError(e)) {
    console.error(
      postgresPasswordAuthFailedMessage({
        host: databaseHost(url ?? ""),
        vercelEnv: process.env.VERCEL_ENV ?? "unknown",
        deployScope: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
        gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
      })
    );
  }
  console.error(e);
  process.exit(1);
});
