/**
 * Seeds Neon `criteria_review_*` tables with sample report review sessions.
 *
 *   pnpm run seed-criteria-review
 *   pnpm run seed-criteria-review -- --dry-run
 *   pnpm run seed-criteria-review -- --from-rows ./reports/criteria-rows.json
 */

import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

/** Match Next.js: `.env.local` overrides `.env`. */
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

function stableDateFromPromptVersion(promptVersion: string): string {
  const match = promptVersion.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]) {
  let inputDir = path.join(process.cwd(), "docs", "sample_files");
  let dryRun = false;
  let fromRows: string | undefined;
  let docConcurrency = 2;
  let reportDate: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir" && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if (a === "--from-rows" && argv[i + 1]) {
      fromRows = path.resolve(argv[++i]);
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if ((a === "--concurrency" || a === "-j") && argv[i + 1]) {
      docConcurrency = Math.max(1, Math.floor(Number(argv[++i])));
    } else if (a === "--report-date" && argv[i + 1]) {
      reportDate = argv[++i];
    }
  }

  return {
    inputDir,
    dryRun,
    fromRows,
    docConcurrency,
    reportDate,
  };
}

async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runNext(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(cap, items.length) }, () => runNext())
  );
  return results;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "Set DATABASE_URL in .env.local or .env (Neon connection string)."
    );
    process.exit(1);
  }

  const { runPendingMigrations } = await import("@/lib/db/run-pending-migrations");
  const { PROMPT_VERSION } = await import("@/lib/ai/evaluate");
  const { buildAllCriteriaReviewSessionItems } = await import(
    "@/lib/criteria-review/report-data"
  );
  const { upsertCriteriaReviewSessionItem } = await import(
    "@/lib/criteria-review/store"
  );
  const { collectDocxFiles, evaluateOneDocx } = await import(
    "@/lib/sample-eval/evaluate-sample-docx"
  );

  type ReportRunOutcome = Awaited<ReturnType<typeof evaluateOneDocx>>;
  type CachedRun = Pick<
    ReportRunOutcome,
    "sourceFile" | "deviationNo" | "skippedReason" | "rows" | "allSections"
  >;

  const args = parseArgs(process.argv.slice(2));
  const reportDate =
    args.reportDate ?? stableDateFromPromptVersion(PROMPT_VERSION);

  const sql = (await import("@neondatabase/serverless")).neon(
    process.env.DATABASE_URL!
  );
  const [{ exists: criteriaTablesReady }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'criteria_review_reports'
    ) AS exists
  `;
  if (!criteriaTablesReady) {
    console.error(
      "criteria_review_* tables missing — applying pending migrations…"
    );
    await runPendingMigrations(process.env.DATABASE_URL!);
  }

  async function loadRuns(): Promise<CachedRun[]> {
    if (args.fromRows) {
      const raw = JSON.parse(fs.readFileSync(args.fromRows, "utf8")) as {
        runs: CachedRun[];
      };
      return raw.runs;
    }

    const files = collectDocxFiles(args.inputDir);
    if (files.length === 0) {
      throw new Error(`No .docx files under ${args.inputDir}`);
    }

    console.error(`Evaluating ${files.length} files…`);
    const outcomes = await mapWithConcurrencyLimit(
      files,
      args.docConcurrency,
      async (f, i) => {
        console.error(`[${i + 1}/${files.length}] ${path.basename(f)}`);
        return evaluateOneDocx(f, reportDate);
      }
    );

    return outcomes.map((o) => ({
      sourceFile: o.sourceFile,
      deviationNo: o.deviationNo,
      skippedReason: o.skippedReason,
      rows: o.rows,
      allSections: o.allSections,
    }));
  }

  const runs = await loadRuns();
  const items = runs.flatMap((run) => {
    if (run.skippedReason) {
      console.error(`  skip ${run.sourceFile}: ${run.skippedReason}`);
      return [];
    }
    return buildAllCriteriaReviewSessionItems({
      sourceFile: run.sourceFile,
      deviationNo: run.deviationNo,
      rows: run.rows,
      allSections: run.allSections,
      reportDate,
      promptVersion: PROMPT_VERSION,
    });
  });

  console.error(`Prepared ${items.length} review reports (prompt ${PROMPT_VERSION})`);

  if (items.length === 0) {
    process.exit(1);
  }

  if (args.dryRun) {
    console.error(JSON.stringify(items[0], null, 2));
    return;
  }

  let n = 0;
  for (const item of items) {
    await upsertCriteriaReviewSessionItem(item, { preserveHumanReview: true });
    n += 1;
    if (n % 10 === 0 || n === items.length) {
      console.error(`  saved ${n}/${items.length}`);
    }
  }

  console.error("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
