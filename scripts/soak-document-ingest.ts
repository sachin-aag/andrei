/**
 * Credentialed PDF extract soak (no DB / GCS). Discards model output.
 *
 *   pnpm soak:pdf-ingest
 *   pnpm soak:pdf-ingest -- --file path/to.pdf --batches 3
 *   pnpm soak:pdf-ingest -- --pages 10-15
 *
 * Requires Vertex credentials (GOOGLE_VERTEX_PROJECT + WIF or ADC).
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID,
  extractPdfBatch,
} from "../src/lib/attachments/extract-batch";
import { splitPdfIntoBatches } from "../src/lib/attachments/pdf-split";
import { validatePdf } from "../src/lib/attachments/validate-pdf";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const DEFAULT_FILE = path.join(
  process.cwd(),
  "docs/sample_files/DEV-QC-25-010 Copy (1).pdf"
);

type Args = {
  file: string;
  batches: number | null;
  pageStart: number | null;
  pageEnd: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    file: DEFAULT_FILE,
    batches: null,
    pageStart: null,
    pageEnd: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
      case "--file":
        if (!value) throw new Error("--file requires a path");
        args.file = path.resolve(value);
        index += 1;
        break;
      case "--batches": {
        if (!value) throw new Error("--batches requires a positive integer");
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("--batches must be a positive integer");
        }
        args.batches = parsed;
        index += 1;
        break;
      }
      case "--pages": {
        if (!value) throw new Error("--pages requires A-B");
        const match = /^(\d+)-(\d+)$/.exec(value);
        if (!match) throw new Error("--pages must look like 10-15");
        args.pageStart = Number(match[1]);
        args.pageEnd = Number(match[2]);
        if (args.pageStart > args.pageEnd) {
          throw new Error("--pages start must be <= end");
        }
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`Usage: pnpm soak:pdf-ingest -- [options]

Options:
  --file <path>     PDF to extract (default: DEV-QC-25-010 sample)
  --batches <n>     Stop after n extract batches
  --pages <A-B>     Only extract batches overlapping this page range
  --help            Show this help
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const modelId =
    process.env.DOCUMENT_EXTRACT_GOOGLE_MODEL_ID?.trim() ||
    DEFAULT_DOCUMENT_EXTRACT_MODEL_ID;

  console.error(`file=${args.file}`);
  console.error(`model=${modelId}`);

  const buffer = readFileSync(args.file);
  const { pageCount } = await validatePdf(buffer, { maxPages: 500 });
  const split = await splitPdfIntoBatches(buffer);
  console.error(
    `pages=${pageCount} splitBatches=${split.batches.length}`
  );

  let selected = split.batches;
  if (args.pageStart != null && args.pageEnd != null) {
    selected = selected.filter(
      (batch) =>
        batch.pageEnd >= args.pageStart! && batch.pageStart <= args.pageEnd!
    );
  }
  if (args.batches != null) {
    selected = selected.slice(0, args.batches);
  }

  if (selected.length === 0) {
    throw new Error("No batches selected for extract");
  }

  let failures = 0;
  let previousSummary: string | null = null;
  let previousNote: string | null = null;

  for (const batch of selected) {
    const started = Date.now();
    try {
      const result = await extractPdfBatch({
        pdfBuffer: batch.buffer,
        pageStart: batch.pageStart,
        pageEnd: batch.pageEnd,
        filename: path.basename(args.file),
        modelId,
        previousBatchSummary: previousSummary,
        previousContinuationNote: previousNote,
      });
      const elapsedMs = Date.now() - started;
      console.log(
        JSON.stringify({
          batchIndex: batch.batchIndex,
          pageStart: batch.pageStart,
          pageEnd: batch.pageEnd,
          recoveredPages: result.pages.length,
          mode: result.mode,
          recovery: result.recovery,
          transcriptChars: result.pages.reduce(
            (total, page) => total + page.transcript.length,
            0
          ),
          finishReason: result.finishReason ?? null,
          usage: result.usage ?? null,
          elapsedMs,
        })
      );
      if (result.pages.length === 0) {
        failures += 1;
      } else {
        previousSummary = result.batchSummary;
        previousNote = result.continuationNote;
      }
    } catch (error) {
      failures += 1;
      console.log(
        JSON.stringify({
          batchIndex: batch.batchIndex,
          pageStart: batch.pageStart,
          pageEnd: batch.pageEnd,
          recoveredPages: 0,
          recovery: "failed",
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - started,
        })
      );
    }
  }

  if (failures > 0) {
    console.error(`soak failed: ${failures} batch(es) produced no pages`);
    process.exit(1);
  }
  console.error(`soak ok: ${selected.length} batch(es)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
