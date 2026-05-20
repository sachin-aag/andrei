/**
 * Seeds a Langfuse dataset for human review of criteria (traffic-light) evaluations.
 *
 * One dataset item per (sample DOCX × criterion) — 13 documents × 36 criteria = 468 items.
 * - input: section content + criterion definition + report context
 * - expectedOutput: AI status + reasoning (baseline from bulk eval pipeline)
 *
 *   npm run seed-langfuse-criteria-dataset
 *   npm run seed-langfuse-criteria-dataset -- --dry-run
 *   npm run seed-langfuse-criteria-dataset -- --from-rows ./reports/criteria-rows.json
 */

import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PROMPT_VERSION } from "@/lib/ai/evaluate";
import {
  CRITERIA_EVAL_DATASET_NAME,
  buildCriteriaDatasetItemsFromRun,
  type CriteriaDatasetItemPayload,
} from "@/lib/langfuse/criteria-dataset";
import {
  ensureLangfuseDataset,
  readLangfuseEnv,
  upsertLangfuseDatasetItem,
} from "@/lib/langfuse/langfuse-rest";
import type { BulkEvalRow } from "@/lib/sample-eval/bulk-eval-aggregates";
import {
  collectDocxFiles,
  evaluateOneDocx,
  type ReportRunOutcome,
} from "@/lib/sample-eval/evaluate-sample-docx";

function stableDateFromPromptVersion(): string {
  const match = PROMPT_VERSION.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]) {
  let inputDir = path.join(process.cwd(), "docs", "sample_files");
  let datasetName: string = CRITERIA_EVAL_DATASET_NAME;
  let dryRun = false;
  let fromRows: string | undefined;
  let docConcurrency = 2;
  let reportDate: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir" && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if (a === "--dataset-name" && argv[i + 1]) {
      datasetName = argv[++i];
    } else if (a === "--from-rows" && argv[i + 1]) {
      fromRows = path.resolve(argv[++i]);
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if ((a === "--concurrency" || a === "-j") && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) {
        console.error(`${a} expects a positive integer`);
        process.exit(1);
      }
      docConcurrency = Math.floor(n);
    } else if (a === "--report-date" && argv[i + 1]) {
      reportDate = argv[++i];
    }
  }

  return {
    inputDir,
    datasetName,
    dryRun,
    fromRows,
    docConcurrency,
    reportDate: reportDate ?? stableDateFromPromptVersion(),
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

  const poolSize = Math.min(cap, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runNext()));
  return results;
}

type CachedRun = {
  sourceFile: string;
  deviationNo: string;
  skippedReason: string | null;
  rows: BulkEvalRow[];
  allSections: ReportRunOutcome["allSections"];
};

function loadRunsFromRowsJson(filePath: string): CachedRun[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    runs: CachedRun[];
  };
  if (!Array.isArray(raw.runs)) {
    throw new Error(`Invalid rows file: expected { runs: [...] } at ${filePath}`);
  }
  return raw.runs;
}

async function collectRuns(params: {
  inputDir: string;
  fromRows?: string;
  docConcurrency: number;
  reportDate: string;
}): Promise<CachedRun[]> {
  if (params.fromRows) {
    console.error(`Loading evaluation rows from ${params.fromRows}`);
    return loadRunsFromRowsJson(params.fromRows);
  }

  const files = collectDocxFiles(params.inputDir);
  if (files.length === 0) {
    throw new Error(`No .docx files found under ${params.inputDir}`);
  }

  console.error(`Evaluating ${files.length} DOCX files (concurrency ${params.docConcurrency})…`);
  const outcomes = await mapWithConcurrencyLimit(
    files,
    params.docConcurrency,
    async (f, i) => {
      console.error(`[${i + 1}/${files.length}] ${path.basename(f)}`);
      return evaluateOneDocx(f, params.reportDate);
    }
  );

  return outcomes.map((run) => ({
    sourceFile: run.sourceFile,
    deviationNo: run.deviationNo,
    skippedReason: run.skippedReason,
    rows: run.rows,
    allSections: run.allSections,
  }));
}

function buildAllItems(
  runs: CachedRun[],
  reportDate: string
): CriteriaDatasetItemPayload[] {
  const items: CriteriaDatasetItemPayload[] = [];
  let reviewIndex = 0;

  for (const run of runs) {
    if (run.skippedReason) {
      console.error(`  skip ${run.sourceFile}: ${run.skippedReason}`);
      continue;
    }
    const chunk = buildCriteriaDatasetItemsFromRun({
      rows: run.rows,
      allSections: run.allSections,
      reportDate,
      startIndex: reviewIndex,
    });
    reviewIndex += chunk.length;
    items.push(...chunk);
  }

  return items;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dryRun && !readLangfuseEnv()) {
    console.error(
      "Langfuse credentials missing. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env.local"
    );
    process.exit(1);
  }

  const runs = await collectRuns({
    inputDir: args.inputDir,
    fromRows: args.fromRows,
    docConcurrency: args.docConcurrency,
    reportDate: args.reportDate,
  });

  const items = buildAllItems(runs, args.reportDate);
  const docCount = runs.filter((r) => !r.skippedReason).length;
  const skippedDocs = runs.length - docCount;

  console.error(
    `Prepared ${items.length} dataset items (${docCount} documents, ${skippedDocs} skipped, prompt ${PROMPT_VERSION})`
  );

  if (items.length === 0) {
    console.error("Nothing to upload.");
    process.exit(1);
  }

  if (args.dryRun) {
    console.error(`Dry run — dataset: ${args.datasetName}`);
    console.error("Sample item:", JSON.stringify(items[0], null, 2));
    return;
  }

  const description =
    "Human review queue for M.J. Biopharm criteria (traffic-light) evaluations on sample deviation DOCX files. " +
    "Each item is one criterion for one report: input = section content + criterion; expectedOutput = AI status + reasoning. " +
    `Seeded from ${docCount} sample documents, prompt version ${PROMPT_VERSION}.`;

  await ensureLangfuseDataset({
    name: args.datasetName,
    description,
  });

  let uploaded = 0;
  for (const item of items) {
    await upsertLangfuseDatasetItem({
      datasetName: args.datasetName,
      id: item.id,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    });
    uploaded += 1;
    if (uploaded % 25 === 0 || uploaded === items.length) {
      console.error(`  uploaded ${uploaded}/${items.length}`);
    }
  }

  const env = readLangfuseEnv()!;
  const datasetPath = encodeURIComponent(args.datasetName);
  console.error("Done.");
  console.error(
    `Open in Langfuse: ${env.baseUrl}/project (Datasets → ${args.datasetName})`
  );
  console.error(`Dataset API name: ${args.datasetName} (URL path: ${datasetPath})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
