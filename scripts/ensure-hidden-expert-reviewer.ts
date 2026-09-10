/**
 * Upserts Aditya as a hidden manager and assigns him to every live report.
 * Runs on every Vercel deploy (demo, MJ, Convergent).
 *
 *   pnpm db:ensure-hidden-expert
 *   pnpm db:ensure-hidden-expert -- --prod
 */
import { config } from "dotenv";
import {
  handleDatabaseScriptAuthFailure,
  loadDatabaseUrlOrExit,
} from "@/lib/db/run-database-script";
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

const url = loadDatabaseUrlOrExit();

async function main() {
  const result = await assignHiddenExpertReviewerToAllReports();
  console.error(
    `Hidden expert reviewer ${result.expertId}: linked ${result.reportsLinked} report(s).`
  );
}

main().catch(async (e) => {
  await handleDatabaseScriptAuthFailure(e, url);
  console.error(e);
  process.exit(1);
});
