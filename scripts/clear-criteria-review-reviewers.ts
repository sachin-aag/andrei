/**
 * Remove all criteria-review submissions from Neon and reset report human_review_status.
 *
 *   pnpm run clear-criteria-review-reviewers -- --dry-run
 *   pnpm run clear-criteria-review-reviewers -- --confirm
 *
 * Uses DATABASE_URL from .env / .env.local (same as next dev / seed scripts).
 */

import { config as loadEnv } from "dotenv";
import { isNotNull, sql } from "drizzle-orm";

loadEnv({ path: ".env" });
//loadEnv({ path: ".env.local", override: true });

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    confirm: argv.includes("--confirm"),
  };
}

function databaseHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

async function main() {
  const { dryRun, confirm } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (.env.local or .env)");
    process.exit(1);
  }

  if (!dryRun && !confirm) {
    console.error(
      "Refusing to delete without --confirm. Preview with --dry-run first."
    );
    process.exit(1);
  }

  const { db, schema } = await import("@/db");

  const [submissions, reports] = await Promise.all([
    db.query.criteriaReviewSubmissions.findMany(),
    db.query.criteriaReviewReports.findMany({
      columns: { id: true, humanReviewStatus: true },
    }),
  ]);

  const reportsWithProgress = reports.filter(
    (r) => r.humanReviewStatus !== "pending"
  );

  console.log(`Database host: ${databaseHost(databaseUrl)}`);
  console.log(`Submissions to delete: ${submissions.length}`);
  console.log(
    `Reports to reset to pending: ${reportsWithProgress.length} / ${reports.length}`
  );

  if (dryRun) {
    console.log("\nDry run only — no changes made.");
    return;
  }

  await db
    .update(schema.criteriaReviewReports)
    .set({ humanReviewStatus: "pending", updatedAt: new Date() });

  await db
    .delete(schema.criteriaReviewSubmissions)
    .where(isNotNull(schema.criteriaReviewSubmissions.id));

  const remaining = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.criteriaReviewSubmissions);

  console.log("\nDone.");
  console.log(`Remaining submissions: ${remaining[0]?.count ?? 0}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
