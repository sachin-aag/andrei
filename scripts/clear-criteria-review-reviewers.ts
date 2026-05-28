/**
 * Remove all criteria-review human reviewers and their submissions from Neon.
 * Resets report human_review_status to pending. Reviewer registry rows are deleted.
 *
 *   pnpm run clear-criteria-review-reviewers -- --dry-run
 *   pnpm run clear-criteria-review-reviewers -- --confirm
 *
 * Uses DATABASE_URL from .env / .env.local (same as next dev / seed scripts).
 * Pass production DATABASE_URL explicitly when targeting prod.
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

  const [reviewers, submissions, reports] = await Promise.all([
    db.query.criteriaReviewReviewers.findMany({
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
    db.query.criteriaReviewSubmissions.findMany(),
    db.query.criteriaReviewReports.findMany({
      columns: { id: true, humanReviewStatus: true },
    }),
  ]);

  const reportsWithProgress = reports.filter(
    (r) => r.humanReviewStatus !== "pending"
  );

  console.log(`Database host: ${databaseHost(databaseUrl)}`);
  console.log(`Reviewers to delete: ${reviewers.length}`);
  for (const reviewer of reviewers) {
    console.log(`  - ${reviewer.name} (${reviewer.email}) [${reviewer.id}]`);
  }
  console.log(`Submissions to delete (cascade): ${submissions.length}`);
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
    .delete(schema.criteriaReviewReviewers)
    .where(isNotNull(schema.criteriaReviewReviewers.id));

  const remainingReviewers = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.criteriaReviewReviewers);
  const remainingSubmissions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.criteriaReviewSubmissions);

  console.log("\nDone.");
  console.log(`Remaining reviewers: ${remainingReviewers[0]?.count ?? 0}`);
  console.log(`Remaining submissions: ${remainingSubmissions[0]?.count ?? 0}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
