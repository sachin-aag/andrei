/**
 * Retrieval eval harness.
 *
 *   pnpm retrieval-eval -- --dry-run
 *   pnpm retrieval-eval -- --from-gcs
 *   pnpm retrieval-eval -- --live
 *   pnpm retrieval-eval -- --report-id <id>
 *
 * `--from-gcs` downloads the test corpus from the retrieval-eval GCS prefix,
 * then ingests, searches, and LLM-judges. That is the CI path. CI never
 * uploads or seeds the bucket — add objects with `pnpm retrieval-eval:upload`.
 * `--live` generates the same PDFs locally (no bucket) for a laptop run.
 * `--report-id` searches an already-ingested report (no ingest).
 *
 * `--dry-run` and `--report-id` merge gitignored
 * `retrieval-cases.local.json` when that file exists (copy
 * `retrieval-cases.local.example.json`). `--from-gcs` and `--live` never
 * merge the overlay — those cases target the synthetic corpus, not a
 * private attachment.
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  noFalsePositiveAtK,
  parseRetrievalCases,
  recallAtK,
  excerptHitAtK,
  type RetrievalEvalCase,
} from "@/lib/attachments/retrieval-metrics";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_CASES = path.join(here, "retrieval-cases.json");
const LOCAL_CASES = path.join(here, "retrieval-cases.local.json");
const RUNS_DIR = path.join(here, "retrieval-runs");

export type RetrievalEvalCliArgs = {
  reportId: string | null;
  dryRun: boolean;
  fromGcs: boolean;
  live: boolean;
  outPath: string | null;
  limit: number;
};

export function parseRetrievalEvalArgs(argv: string[]): RetrievalEvalCliArgs {
  let reportId: string | null = null;
  let dryRun = false;
  let fromGcs = false;
  let live = false;
  let outPath: string | null = null;
  let limit = 10;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--from-gcs") fromGcs = true;
    else if (arg === "--live") live = true;
    else if (arg === "--report-id" && argv[i + 1]) {
      reportId = argv[++i]!;
    } else if (arg === "--out" && argv[i + 1]) {
      outPath = path.resolve(argv[++i]!);
    } else if (arg === "--limit" && argv[i + 1]) {
      limit = Number(argv[++i]);
    }
  }
  if (fromGcs && live) {
    throw new Error("Pass only one of --from-gcs or --live");
  }
  if (fromGcs && reportId) {
    throw new Error("Pass only one of --from-gcs or --report-id");
  }
  if (live && reportId) {
    throw new Error("Pass only one of --live or --report-id");
  }
  if (!reportId && !fromGcs && !live) dryRun = true;
  return { reportId, dryRun, fromGcs, live, outPath, limit };
}

/** Overlay is a laptop path. CI `--from-gcs` / `--live` stay on the public set. */
export function shouldLoadLocalOverlay(args: RetrievalEvalCliArgs): boolean {
  return !args.fromGcs && !args.live;
}

/** Local overlay wins on id collision and may add cases. Missing overlay is a no-op. */
export function mergeRetrievalEvalCases(
  publicCases: RetrievalEvalCase[],
  overlayCases: RetrievalEvalCase[] | null
): RetrievalEvalCase[] {
  if (overlayCases == null || overlayCases.length === 0) return publicCases;
  const byId = new Map(publicCases.map((entry) => [entry.id, entry]));
  for (const entry of overlayCases) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function loadRetrievalEvalCases(
  args: RetrievalEvalCliArgs
): RetrievalEvalCase[] {
  const publicCases = parseRetrievalCases(
    JSON.parse(fs.readFileSync(PUBLIC_CASES, "utf8"))
  );
  if (!shouldLoadLocalOverlay(args)) return publicCases;
  if (!fs.existsSync(LOCAL_CASES)) return publicCases;
  const overlayCases = parseRetrievalCases(
    JSON.parse(fs.readFileSync(LOCAL_CASES, "utf8"))
  );
  if (overlayCases.length === 0) return publicCases;
  const merged = mergeRetrievalEvalCases(publicCases, overlayCases);
  console.log(
    `merged retrieval-cases.local.json (${overlayCases.length} overlay case(s), ${merged.length} total)`
  );
  return merged;
}

function enableLocalAttachmentStorage(): void {
  process.env.ATTACHMENT_STORAGE_BACKEND = "local";
  process.env.ALLOW_LOCAL_ATTACHMENT_STORAGE = "true";
  if (!process.env.AUTH_SECRET?.trim()) {
    process.env.AUTH_SECRET = "retrieval-eval-local-secret";
  }
}

async function runCases(input: {
  reportId: string;
  cases: RetrievalEvalCase[];
  limit: number;
}): Promise<{
  rows: Array<{
    id: string;
    query: string;
    kind: string;
    verdict: "pass" | "fail";
    reasoning: string;
    recallAt5: number | null;
    excerptHitAt5: number | null;
    noFalsePositiveAt5: number | null;
    skippedEmbedding: boolean;
    embedMs: number;
    sqlMs: number;
    totalMs: number;
    top: Array<{ filename: string; pageNumber: number }>;
  }>;
  failed: string[];
}> {
  const { searchReportDocumentsDetailed } = await import(
    "@/lib/attachments/retrieval"
  );
  const { judgeRetrievalCase } = await import("./retrieval-judge");
  const rows = [];
  const failed: string[] = [];

  for (const entry of input.cases) {
    const { results, timing } = await searchReportDocumentsDetailed({
      reportId: input.reportId,
      query: entry.query,
      limit: input.limit,
    });
    const ranked = results.map((hit) => ({
      filename: hit.filename,
      pageNumber: hit.pageNumber,
      text: hit.text,
    }));
    const leak = noFalsePositiveAtK(ranked, entry.mustNotContainAnywhere, 5);
    const excerptHit = excerptHitAtK(ranked, entry.gold, 5);
    let verdict: "pass" | "fail";
    let reasoning: string;
    if (leak === 0) {
      verdict = "fail";
      reasoning =
        "Deterministic fail: mustNotContainAnywhere leaked into a top-5 excerpt.";
    } else if (excerptHit === 0) {
      verdict = "fail";
      reasoning =
        "Deterministic fail: gold excerpt mustContain missing from the matching top-5 hit.";
    } else {
      const judged = await judgeRetrievalCase(entry, ranked.slice(0, 5));
      verdict = judged.verdict;
      reasoning = judged.reasoning;
    }
    if (verdict === "fail") failed.push(entry.id);
    rows.push({
      id: entry.id,
      query: entry.query,
      kind: entry.kind,
      verdict,
      reasoning,
      recallAt5: entry.gold.length > 0 ? recallAtK(ranked, entry.gold, 5) : null,
      excerptHitAt5: excerptHit,
      noFalsePositiveAt5: leak,
      skippedEmbedding: timing.skippedEmbedding,
      embedMs: timing.embedMs,
      sqlMs: timing.sqlMs,
      totalMs: timing.totalMs,
      top: ranked.slice(0, 5).map(({ filename, pageNumber }) => ({
        filename,
        pageNumber,
      })),
    });
    const last = rows.at(-1)!;
    const recallLabel =
      last.recallAt5 == null ? "n/a" : last.recallAt5.toFixed(2);
    const excerptLabel =
      last.excerptHitAt5 == null ? "n/a" : last.excerptHitAt5.toFixed(2);
    console.log(
      `${entry.id}  ${verdict.toUpperCase()}  R@5=${recallLabel}  excerpt@5=${excerptLabel}  embed=${
        timing.skippedEmbedding ? "skip" : `${timing.embedMs}ms`
      }  sql=${timing.sqlMs}ms`
    );
    console.log(`  ${reasoning}`);
  }

  return { rows, failed };
}

async function resolveReportId(args: RetrievalEvalCliArgs): Promise<string> {
  if (args.reportId) return args.reportId;
  enableLocalAttachmentStorage();
  const files = args.fromGcs
    ? await (await import("./retrieval-gcs")).loadRetrievalEvalCorpus()
    : await (await import("./retrieval-corpus")).buildRetrievalCorpus();
  const { ingestCorpusIntoNewReport } = await import("./retrieval-eval-setup");
  const reportId = await ingestCorpusIntoNewReport(files);
  console.log(`ingested report ${reportId}`);
  return reportId;
}

export async function runRetrievalEval(argv: string[]): Promise<void> {
  const args = parseRetrievalEvalArgs(argv);
  const cases = loadRetrievalEvalCases(args);
  if (args.dryRun) {
    console.log(`retrieval-eval dry-run: ${cases.length} cases valid`);
    for (const entry of cases) {
      console.log(`  ${entry.id}\t${entry.kind}\t${entry.query}`);
    }
    return;
  }

  const reportId = await resolveReportId(args);
  const { rows, failed } = await runCases({
    reportId,
    cases,
    limit: args.limit,
  });
  const n = rows.length || 1;
  const passed = rows.filter((row) => row.verdict === "pass").length;
  const summary = {
    cases: rows.length,
    judgePassRate: passed / n,
    failed,
    embedMs: rows.reduce((sum, row) => sum + row.embedMs, 0) / n,
    sqlMs: rows.reduce((sum, row) => sum + row.sqlMs, 0) / n,
    totalMs: rows.reduce((sum, row) => sum + row.totalMs, 0) / n,
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

  if (failed.length > 0) {
    throw new Error(
      `Retrieval eval failed ${failed.length} case(s): ${failed.join(", ")}`
    );
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runRetrievalEval(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
