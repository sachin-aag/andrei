/**
 * Compare Gemini vision extract vs Document AI OCR. No DB / GCS writes.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/soak-ocr-compare.ts \
 *     --file "Appendix B DV Report 790-00134R(RevU) Model 3 Software DV Report (includes Appendix).pdf"
 *
 * Requires Vertex ADC/WIF plus DOCUMENT_AI_PROCESSOR_ID and DOCUMENT_AI_LOCATION.
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID,
  extractPdfBatch,
} from "../src/lib/attachments/extract-batch";
import {
  DOCUMENT_AI_COMPARE_ATTEMPTS,
  isDocumentAiConfigured,
  ocrPdfWithDocumentAi,
  type DocumentAiOcrAttempt,
} from "../src/lib/attachments/document-ai-ocr";
import {
  evaluateCompareGate,
  GEMINI_APPENDIX_B_BASELINE_MS,
  OCR_QUALITY_PAGES,
  scoreQualityPage,
  type QualityPageMetrics,
} from "../src/lib/attachments/ocr-quality";
import { copyPdfPage } from "../src/lib/attachments/pdf-split";
import { validatePdf } from "../src/lib/attachments/validate-pdf";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const DEFAULT_FILE = path.join(
  process.cwd(),
  "Appendix B DV Report 790-00134R(RevU) Model 3 Software DV Report (includes Appendix).pdf"
);
const FALLBACK_FILE = path.join(
  process.cwd(),
  "docs/sample_files/appendix-b-790-00134r-revu.pdf"
);

type Args = {
  file: string;
  pages: number[];
  attempt: number;
  maxAttempts: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    file: DEFAULT_FILE,
    pages: [...OCR_QUALITY_PAGES],
    attempt: 1,
    maxAttempts: DOCUMENT_AI_COMPARE_ATTEMPTS.length,
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
      case "--pages": {
        if (!value) throw new Error("--pages requires a comma list");
        args.pages = value.split(",").map((part) => {
          const parsed = Number(part.trim());
          if (!Number.isInteger(parsed) || parsed < 1) {
            throw new Error(`Invalid page: ${part}`);
          }
          return parsed;
        });
        index += 1;
        break;
      }
      case "--attempt": {
        if (!value) throw new Error("--attempt requires 1-3");
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("--attempt must be a positive integer");
        }
        args.attempt = parsed;
        index += 1;
        break;
      }
      case "--max-attempts": {
        if (!value) throw new Error("--max-attempts requires 1-3");
        args.maxAttempts = Number(value);
        index += 1;
        break;
      }
      case "--skip-gemini-full":
        break;
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
  console.log(`Usage: pnpm soak:ocr-compare -- [options]

Options:
  --file <path>       PDF to compare
  --pages 1,4,31,37,59
  --attempt <n>       Start at this Document AI config (1-3)
  --max-attempts <n>  Stop after this many configs (default 3)
  --help
`);
}

function resolveFile(preferred: string): string {
  try {
    readFileSync(preferred);
    return preferred;
  } catch {
    return FALLBACK_FILE;
  }
}

async function geminiPageTranscript(
  source: Buffer,
  pageNumber: number,
  filename: string,
  modelId: string
): Promise<{ transcript: string; elapsedMs: number; recovery: string }> {
  const pageBuffer = await copyPdfPage(source, pageNumber);
  const started = Date.now();
  const result = await extractPdfBatch({
    pdfBuffer: pageBuffer,
    pageStart: pageNumber,
    pageEnd: pageNumber,
    filename,
    modelId,
  });
  return {
    transcript: result.pages[0]?.transcript ?? "",
    elapsedMs: Date.now() - started,
    recovery: result.recovery,
  };
}

function writeCompareArtifacts(input: {
  attempt: number;
  config: DocumentAiOcrAttempt;
  file: string;
  ocrElapsedMs: number;
  ocrPageCount: number;
  chunks: unknown;
  pages: QualityPageMetrics[];
  gemini: Record<number, { transcript: string; elapsedMs: number; recovery: string }>;
  ocrByPage: Record<number, { transcript: string; confidence: number | null }>;
}): { dir: string; pass: boolean } {
  const gate = evaluateCompareGate({
    ocrElapsedMs: input.ocrElapsedMs,
    pages: input.pages,
  });
  const dir = path.join(
    process.cwd(),
    ".data/ocr-compare",
    `attempt-${input.attempt}-${input.config.id}`
  );
  mkdirSync(dir, { recursive: true });

  const report = {
    attempt: input.attempt,
    config: input.config,
    file: input.file,
    geminiFullBaselineMs: GEMINI_APPENDIX_B_BASELINE_MS,
    ocrFull: {
      elapsedMs: input.ocrElapsedMs,
      pageCount: input.ocrPageCount,
      chunks: input.chunks,
    },
    pages: input.pages.map((page) => ({
      ...page,
      ocr: input.ocrByPage[page.pageNumber],
      gemini: input.gemini[page.pageNumber],
    })),
    gate,
  };
  writeFileSync(path.join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  for (const page of input.pages) {
    const ocr = input.ocrByPage[page.pageNumber];
    const gemini = input.gemini[page.pageNumber];
    writeFileSync(
      path.join(dir, `page-${page.pageNumber}-ocr.txt`),
      `${ocr?.transcript ?? ""}\n`
    );
    writeFileSync(
      path.join(dir, `page-${page.pageNumber}-gemini.txt`),
      `${gemini?.transcript ?? ""}\n`
    );
  }

  const lines = [
    `# OCR compare attempt ${input.attempt} (${input.config.id})`,
    "",
    `- File: \`${path.basename(input.file)}\``,
    `- Gemini 62-page baseline: **${GEMINI_APPENDIX_B_BASELINE_MS} ms**`,
    `- Document AI 62-page wall clock: **${input.ocrElapsedMs} ms**`,
    `- Gate: **${gate.pass ? "PASS" : "FAIL"}**`,
    "",
    gate.reasons.length > 0 ? `Reasons:\n${gate.reasons.map((reason) => `- ${reason}`).join("\n")}` : "",
    "",
    "| Page | OCR chars | Gemini chars | ratio | sideways | weak | idRecall | Gemini ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...input.pages.map((page) => {
      const gemini = input.gemini[page.pageNumber];
      return `| ${page.pageNumber} | ${page.ocrChars} | ${page.geminiChars} | ${page.charRatio?.toFixed(2) ?? "n/a"} | ${page.sidewaysLikely} | ${page.weak} | ${page.idRecall?.toFixed(2) ?? "n/a"} | ${gemini?.elapsedMs ?? ""} |`;
    }),
  ];
  writeFileSync(path.join(dir, "summary.md"), `${lines.filter((line) => line !== undefined).join("\n")}\n`);
  writeFileSync(
    path.join(process.cwd(), ".data/ocr-compare/summary.md"),
    `${lines.filter((line) => line !== undefined).join("\n")}\n`
  );
  return { dir, pass: gate.pass };
}

async function runAttempt(input: {
  file: string;
  buffer: Buffer;
  pages: number[];
  attemptIndex: number;
  config: DocumentAiOcrAttempt;
  geminiCache: Map<
    number,
    { transcript: string; elapsedMs: number; recovery: string }
  >;
  modelId: string;
}): Promise<boolean> {
  console.error(
    `attempt=${input.attemptIndex} config=${input.config.id} chunkPages=${input.config.chunkPages} preRotate=${input.config.preRotate}`
  );
  const ocr = await ocrPdfWithDocumentAi({
    pdfBuffer: input.buffer,
    filename: path.basename(input.file),
    attempt: input.config,
  });
  console.error(
    `ocr pages=${ocr.pages.length} elapsedMs=${ocr.elapsedMs} chunks=${ocr.chunks.length}`
  );

  const ocrByPage: Record<
    number,
    { transcript: string; confidence: number | null }
  > = {};
  for (const page of ocr.pages) {
    ocrByPage[page.pageNumber] = {
      transcript: page.transcript,
      confidence: page.confidence,
    };
  }

  const gemini: Record<
    number,
    { transcript: string; elapsedMs: number; recovery: string }
  > = {};
  for (const pageNumber of input.pages) {
    let cached = input.geminiCache.get(pageNumber);
    if (!cached) {
      console.error(`gemini page=${pageNumber}`);
      cached = await geminiPageTranscript(
        input.buffer,
        pageNumber,
        path.basename(input.file),
        input.modelId
      );
      input.geminiCache.set(pageNumber, cached);
      console.error(
        `gemini page=${pageNumber} elapsedMs=${cached.elapsedMs} recovery=${cached.recovery} chars=${cached.transcript.length}`
      );
    }
    gemini[pageNumber] = cached;
  }

  const metrics = input.pages.map((pageNumber) =>
    scoreQualityPage({
      pageNumber,
      ocrText: ocrByPage[pageNumber]?.transcript ?? "",
      ocrConfidence: ocrByPage[pageNumber]?.confidence ?? null,
      geminiText: gemini[pageNumber]?.transcript ?? "",
    })
  );

  const { dir, pass } = writeCompareArtifacts({
    attempt: input.attemptIndex,
    config: input.config,
    file: input.file,
    ocrElapsedMs: ocr.elapsedMs,
    ocrPageCount: ocr.pages.length,
    chunks: ocr.chunks,
    pages: metrics,
    gemini,
    ocrByPage,
  });
  console.error(`wrote ${dir} gate=${pass ? "PASS" : "FAIL"}`);
  return pass;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!isDocumentAiConfigured()) {
    throw new Error(
      "Set GOOGLE_VERTEX_PROJECT, DOCUMENT_AI_LOCATION, and DOCUMENT_AI_PROCESSOR_ID"
    );
  }

  const file = resolveFile(args.file);
  const buffer = readFileSync(file);
  const { pageCount } = await validatePdf(buffer, { maxPages: 500 });
  console.error(`file=${file} pages=${pageCount}`);

  const modelId =
    process.env.DOCUMENT_EXTRACT_GOOGLE_MODEL_ID?.trim() ||
    DEFAULT_DOCUMENT_EXTRACT_MODEL_ID;
  const geminiCache = new Map<
    number,
    { transcript: string; elapsedMs: number; recovery: string }
  >();

  const startIndex = Math.max(0, args.attempt - 1);
  const endIndex = Math.min(
    DOCUMENT_AI_COMPARE_ATTEMPTS.length,
    args.maxAttempts
  );
  let passed = false;
  for (let index = startIndex; index < endIndex; index += 1) {
    const config = DOCUMENT_AI_COMPARE_ATTEMPTS[index];
    if (!config) break;
    passed = await runAttempt({
      file,
      buffer,
      pages: args.pages,
      attemptIndex: index + 1,
      config,
      geminiCache,
      modelId,
    });
    if (passed) break;
    console.error("gate failed; trying next allowed Document AI config");
  }

  if (!passed) {
    console.error("soak-ocr-compare: gate did not pass within max attempts");
    process.exit(1);
  }
  console.error("soak-ocr-compare: gate passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
