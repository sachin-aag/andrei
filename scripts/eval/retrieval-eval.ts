/**
 * Retrieval eval harness (phase 0).
 *
 *   pnpm retrieval-eval
 *   pnpm retrieval-eval -- --dry-run
 *   pnpm retrieval-eval -- --report-id <id>
 *
 * Dry-run validates `retrieval-cases.json` (+ optional gitignored local
 * overlay) without touching the database. `--report-id` runs
 * `searchReportDocumentsDetailed` against a report that already has the
 * sample files ingested.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  meanReciprocalRank,
  parseRetrievalCases,
  recallAtK,
  type RetrievalEvalCase,
} from "@/lib/attachments/retrieval-metrics";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_CASES = path.join(here, "retrieval-cases.json");
const LOCAL_CASES = path.join(here, "retrieval-cases.local.json");
const RUNS_DIR = path.join(here, "retrieval-runs");

type CliArgs = {
  reportId: string | null;
  dryRun: boolean;
  outPath: string | null;
  limit: number;
};

function parseArgs(argv: string[]): CliArgs {
  let reportId: string | null = null;
  let dryRun = false;
  let outPath: string | null = null;
  let limit = 10;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--report-id" && argv[i + 1]) {
      reportId = argv[++i]!;
    } else if (arg === "--out" && argv[i + 1]) {
      outPath = path.resolve(argv[++i]!);
    } else if (arg === "--limit" && argv[i + 1]) {
      limit = Number(argv[++i]);
    }
  }
  if (!reportId) dryRun = true;
  return { reportId, dryRun, outPath, limit };
}

function loadCaseFiles(): RetrievalEvalCase[] {
  const publicRaw = JSON.parse(fs.readFileSync(PUBLIC_CASES, "utf8"));
  const cases = parseRetrievalCases(publicRaw);
  if (!fs.existsSync(LOCAL_CASES)) return cases;
  const localRaw = JSON.parse(fs.readFileSync(LOCAL_CASES, "utf8"));
  const local = parseRetrievalCases(localRaw);
  const byId = new Map(cases.map((entry) => [entry.id, entry]));
  for (const entry of local) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadCaseFiles();
  if (args.dryRun) {
    console.log(`retrieval-eval dry-run: ${cases.length} cases valid`);
    for (const entry of cases) {
      console.log(`  ${entry.id}\t${entry.kind}\t${entry.query}`);
    }
    return;
  }

  const reportId = args.reportId;
  if (!reportId) {
    throw new Error("unreachable: live run requires --report-id");
  }

  const { searchReportDocumentsDetailed } = await import(
    "@/lib/attachments/retrieval"
  );

  const rows: Array<{
    id: string;
    query: string;
    kind: string;
    recallAt5: number;
    recallAt10: number;
    mrr: number;
    skippedEmbedding: boolean;
    embedMs: number;
    sqlMs: number;
    totalMs: number;
    top: Array<{ filename: string; pageNumber: number }>;
  }> = [];

  for (const entry of cases) {
    const { results, timing } = await searchReportDocumentsDetailed({
      reportId,
      query: entry.query,
      limit: args.limit,
    });
    const ranked = results.map((hit) => ({
      filename: hit.filename,
      pageNumber: hit.pageNumber,
    }));
    rows.push({
      id: entry.id,
      query: entry.query,
      kind: entry.kind,
      recallAt5: recallAtK(ranked, entry.gold, 5),
      recallAt10: recallAtK(ranked, entry.gold, 10),
      mrr: meanReciprocalRank(ranked, entry.gold),
      skippedEmbedding: timing.skippedEmbedding,
      embedMs: timing.embedMs,
      sqlMs: timing.sqlMs,
      totalMs: timing.totalMs,
      top: ranked.slice(0, 5),
    });
    console.log(
      `${entry.id}  R@5=${rows.at(-1)!.recallAt5.toFixed(2)}  R@10=${rows
        .at(-1)!
        .recallAt10.toFixed(2)}  MRR=${rows.at(-1)!.mrr.toFixed(2)}  embed=${
        timing.skippedEmbedding ? "skip" : `${timing.embedMs}ms`
      }  sql=${timing.sqlMs}ms`
    );
  }

  const n = rows.length || 1;
  const summary = {
    cases: rows.length,
    recallAt5: rows.reduce((sum, row) => sum + row.recallAt5, 0) / n,
    recallAt10: rows.reduce((sum, row) => sum + row.recallAt10, 0) / n,
    mrr: rows.reduce((sum, row) => sum + row.mrr, 0) / n,
    embedMs: rows.reduce((sum, row) => sum + row.embedMs, 0) / n,
    sqlMs: rows.reduce((sum, row) => sum + row.sqlMs, 0) / n,
    totalMs: rows.reduce((sum, row) => sum + row.totalMs, 0) / n,
    skippedEmbedding: rows.filter((row) => row.skippedEmbedding).length,
  };
  console.log("summary", summary);

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = args.outPath ?? path.join(RUNS_DIR, `${stamp}.json`);
  fs.writeFileSync(
    dest,
    JSON.stringify({ reportId, summary, rows }, null, 2)
  );
  console.log(`wrote ${dest}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
