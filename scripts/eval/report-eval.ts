/**
 * Report-shaped quality floor.
 *
 *   pnpm report-eval -- --dry-run
 *   pnpm report-eval -- --replay
 *   pnpm report-eval -- --sync
 *   pnpm report-eval -- --experiment
 *   pnpm report-eval -- --capture <reportId> [--section qsr_rtm_process]
 *   pnpm report-eval -- --search --report-id <id>
 *
 * Git owns the public cases (`scripts/eval/report-eval-cases.json`).
 * `--replay` is the merge gate (grounding + snapshot gold, no LLM, no DB).
 * `--capture` writes gitignored `report-eval-cases.local.json` from a
 * finished report's cited pages. `--search` runs hybrid retrieval against
 * an ingested report (needs DATABASE_URL). `--sync` / `--experiment` skip
 * when LANGFUSE_* keys are missing. `--live` is reserved.
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import type { Evaluator, RunEvaluator } from "@langfuse/client";
import type { SectionType } from "@/db/schema";
import { CHAT_PROMPT_VERSION } from "@/lib/ai/chat/system-prompt";
import { contextForPrompt } from "@/lib/ai/section-context";
import { filenameMatches } from "@/lib/attachments/retrieval-metrics";
import {
  getWorkspaceSections,
  isValidSection,
} from "@/lib/document-types";
import { isLangfuseEnabled } from "@/lib/observability/langfuse";
import {
  citedPagesFromDraft,
  mergeReportEvalCases,
  parseReportEvalArgs,
  parseReportEvalCases,
  replayReportEvalCases,
  reportEvalNeedsSearch,
  scoreReportEvalRetrieval,
  snapshotToReportEvalCase,
  REPORT_EVAL_DATASET_NAME,
  type ReportEvalCase,
  type ReportEvalCaseScore,
  type ReportEvalSnapshot,
} from "@/lib/eval/report-eval-cases";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_CASES = path.join(here, "report-eval-cases.json");
const LOCAL_CASES = path.join(here, "report-eval-cases.local.json");
const RUNS_DIR = path.join(here, "report-eval-runs");

export function loadReportEvalCases(): ReportEvalCase[] {
  const publicCases = parseReportEvalCases(
    JSON.parse(fs.readFileSync(PUBLIC_CASES, "utf8"))
  );
  if (!fs.existsSync(LOCAL_CASES)) return publicCases;
  const overlayCases = parseReportEvalCases(
    JSON.parse(fs.readFileSync(LOCAL_CASES, "utf8"))
  );
  const merged = mergeReportEvalCases(publicCases, overlayCases);
  console.log(
    `merged report-eval-cases.local.json (${overlayCases.length} overlay case(s), ${merged.length} total)`
  );
  return merged;
}

function printScores(scores: ReportEvalCaseScore[]): void {
  for (const score of scores) {
    const mark = score.passed ? "pass" : "FAIL";
    const detail = score.failures.length > 0 ? ` — ${score.failures.join("; ")}` : "";
    const skipped = score.layers
      .filter((layer) => layer.skipped)
      .map((layer) => `${layer.name}:${layer.skipped}`)
      .join(", ");
    const skipNote = skipped ? ` (${skipped})` : "";
    console.log(`  ${mark}  ${score.id}${detail}${skipNote}`);
  }
}

function writeRun(scores: ReportEvalCaseScore[]): string {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outPath = path.join(RUNS_DIR, `${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        promptVersion: CHAT_PROMPT_VERSION,
        dataset: REPORT_EVAL_DATASET_NAME,
        passed: scores.filter((row) => row.passed).length,
        total: scores.length,
        scores,
      },
      null,
      2
    )
  );
  return outPath;
}

function missingLangfuseMessage(): string {
  return "Langfuse keys missing (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY). Replay still ran locally. Skip --sync / --experiment or add keys from Langfuse → Settings → API Keys.";
}

async function ensureLangfuseDataset(
  cases: ReportEvalCase[]
): Promise<{ hosted: boolean; itemCount: number }> {
  const { LangfuseClient } = await import("@langfuse/client");
  const client = new LangfuseClient();
  try {
    await client.api.datasets.create({
      name: REPORT_EVAL_DATASET_NAME,
      description:
        "Git-owned report-shaped quality floor (cited pages + grounding). Source: scripts/eval/report-eval-cases.json. Overlay is laptop-only.",
    });
    console.log(`created Langfuse dataset ${REPORT_EVAL_DATASET_NAME}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/already exists|409|conflict/i.test(message)) throw err;
    console.log(`Langfuse dataset ${REPORT_EVAL_DATASET_NAME} already exists`);
  }

  for (const entry of cases) {
    await client.dataset.createItem({
      datasetName: REPORT_EVAL_DATASET_NAME,
      id: entry.id,
      input: entry,
      expectedOutput: entry.expected,
      metadata: {
        documentType: entry.input.documentType,
        section: entry.input.section,
        passCriteria: entry.passCriteria,
        notes: entry.notes ?? "",
        promptVersion: CHAT_PROMPT_VERSION,
      },
    });
  }
  await client.flush();
  await client.shutdown();
  return { hosted: true, itemCount: cases.length };
}

const qualityFloorEvaluator: Evaluator = async ({ output }) => {
  const score = output as ReportEvalCaseScore;
  return {
    name: "quality_floor",
    value: score.passed ? 1 : 0,
    comment: score.failures.join("; ") || score.id,
    dataType: "NUMERIC",
  };
};

const passRateEvaluator: RunEvaluator = async ({ itemResults }) => {
  const values = itemResults
    .flatMap((row) => row.evaluations)
    .filter((evaluation) => evaluation.name === "quality_floor")
    .map((evaluation) => Number(evaluation.value));
  const passed = values.filter((value) => value === 1).length;
  const avg = values.length === 0 ? 0 : passed / values.length;
  return {
    name: "pass_rate",
    value: avg,
    comment: `${passed}/${values.length} passed`,
    dataType: "NUMERIC",
  };
};

async function runLangfuseExperiment(): Promise<{
  runName: string;
  datasetRunUrl?: string;
}> {
  const { LangfuseClient } = await import("@langfuse/client");
  const { LangfuseSpanProcessor } = await import("@langfuse/otel");
  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");

  const processor = new LangfuseSpanProcessor({
    baseUrl:
      process.env.LANGFUSE_BASE_URL?.trim() ||
      process.env.LANGFUSE_HOST?.trim() ||
      undefined,
    exportMode: "immediate",
    additionalHeaders: {
      "x-langfuse-ingestion-version": "4",
    },
  });
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [processor],
  });
  tracerProvider.register();
  const client = new LangfuseClient();
  const runName = `${CHAT_PROMPT_VERSION}-${new Date().toISOString().slice(0, 19)}`;

  try {
    const dataset = await client.dataset.get(REPORT_EVAL_DATASET_NAME);
    const result = await dataset.runExperiment({
      name: REPORT_EVAL_DATASET_NAME,
      runName,
      description: `Report-shaped quality floor at ${CHAT_PROMPT_VERSION}`,
      metadata: {
        promptVersion: CHAT_PROMPT_VERSION,
        source: "scripts/eval/report-eval-cases.json",
      },
      maxConcurrency: 4,
      task: async (item) => {
        const entry = item.input as ReportEvalCase;
        if (!entry?.id || !entry.input?.section) {
          throw new Error("Langfuse dataset item is missing a report-eval case");
        }
        return replayReportEvalCases([entry])[0];
      },
      evaluators: [qualityFloorEvaluator],
      runEvaluators: [passRateEvaluator],
    });
    const formatted = await result.format({ includeItemResults: true });
    console.log(formatted);
    if (result.datasetRunUrl) {
      console.log(`Langfuse dataset run ${result.datasetRunUrl}`);
    }
    return { runName, datasetRunUrl: result.datasetRunUrl };
  } finally {
    await client.flush();
    await client.shutdown();
    await tracerProvider.shutdown();
  }
}

async function captureReport(input: {
  reportId: string;
  section: string | null;
}): Promise<ReportEvalCase[]> {
  const { db, closeDbConnections } = await import("@/db");
  const {
    reports,
    reportSections,
    reportAttachments,
    documentPages,
  } = await import("@/db/schema");
  try {
    const [report] = await db
      .select({
        id: reports.id,
        documentNo: reports.documentNo,
        documentType: reports.documentType,
      })
      .from(reports)
      .where(and(eq(reports.id, input.reportId), isNull(reports.deletedAt)))
      .limit(1);
    if (!report) {
      throw new Error(`No live report ${input.reportId}`);
    }

    const sectionRows = await db
      .select({
        section: reportSections.section,
        content: reportSections.content,
      })
      .from(reportSections)
      .where(eq(reportSections.reportId, report.id));

    const attachmentRows = await db
      .select({
        id: reportAttachments.id,
        filename: reportAttachments.filename,
        activeIngestRunId: reportAttachments.activeIngestRunId,
      })
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, report.id),
          isNull(reportAttachments.deletedAt)
        )
      );

    const pageRows = await db
      .select({
        attachmentId: documentPages.attachmentId,
        pageNumber: documentPages.pageNumber,
        transcript: documentPages.transcript,
        pageContext: documentPages.pageContext,
        ingestRunId: documentPages.ingestRunId,
      })
      .from(documentPages)
      .where(eq(documentPages.reportId, report.id));

    const filenameById = new Map(
      attachmentRows.map((row) => [row.id, row.filename])
    );
    const attachedFilenames = attachmentRows.map((row) => row.filename);
    const activeRunByAttachment = new Map(
      attachmentRows.map((row) => [row.id, row.activeIngestRunId])
    );
    const livePages = pageRows.filter((row) => {
      const active = activeRunByAttachment.get(row.attachmentId);
      return Boolean(active) && row.ingestRunId === active;
    });

    const labels = new Map(
      getWorkspaceSections(report.documentType).map((row) => [row.key, row.label])
    );
    const wanted = input.section?.trim() || null;
    const cases: ReportEvalCase[] = [];

    for (const row of sectionRows) {
      if (wanted && row.section !== wanted) continue;
      if (!isValidSection(report.documentType, row.section)) continue;
      const draftText = contextForPrompt(
        row.section as SectionType,
        row.content
      ).trim();
      if (!draftText) {
        console.log(`  skip  ${row.section} (empty)`);
        continue;
      }
      const cited = citedPagesFromDraft(draftText, attachedFilenames);
      if (cited.length === 0) {
        console.log(`  skip  ${row.section} (no citations)`);
        continue;
      }
      const pages = cited.flatMap((hit) => {
        const match = livePages.find((page) => {
          const filename = filenameById.get(page.attachmentId);
          return (
            filename != null &&
            filenameMatches(filename, hit.filename) &&
            page.pageNumber === hit.page
          );
        });
        const filename =
          match != null
            ? filenameById.get(match.attachmentId) ?? hit.filename
            : hit.filename;
        const quote =
          match != null
            ? match.transcript.trim() || match.pageContext?.trim() || ""
            : "";
        return [
          {
            filename,
            pageNumber: hit.page,
            attachmentId: match?.attachmentId ?? hit.filename,
            quote,
          },
        ];
      });
      const snapshot: ReportEvalSnapshot = {
        reportId: report.id,
        documentNo: report.documentNo,
        documentType: report.documentType,
        section: row.section,
        sectionLabel: labels.get(row.section as SectionType),
        draftText,
        attachedFilenames,
        pages,
        capturedAt: new Date().toISOString(),
      };
      const entry = snapshotToReportEvalCase(snapshot);
      cases.push(entry);
      console.log(`  take  ${entry.id} (${cited.length} cited page(s))`);
    }
    return cases;
  } finally {
    await closeDbConnections();
  }
}

function writeLocalOverlay(captured: ReportEvalCase[]): string {
  const existing = fs.existsSync(LOCAL_CASES)
    ? parseReportEvalCases(JSON.parse(fs.readFileSync(LOCAL_CASES, "utf8")))
    : [];
  const merged = mergeReportEvalCases(existing, captured);
  fs.writeFileSync(LOCAL_CASES, `${JSON.stringify(merged, null, 2)}\n`);
  return LOCAL_CASES;
}

async function runSearch(input: {
  cases: ReportEvalCase[];
  reportId: string | null;
}): Promise<ReportEvalCaseScore[]> {
  const { searchReportDocumentsDetailed } = await import(
    "@/lib/attachments/retrieval"
  );
  const scores: ReportEvalCaseScore[] = [];
  for (const entry of input.cases) {
    const base = replayReportEvalCases([entry])[0]!;
    if (!reportEvalNeedsSearch(entry)) {
      scores.push(base);
      continue;
    }
    const reportId = input.reportId ?? entry.source?.reportId;
    if (!reportId) {
      scores.push({
        ...base,
        layers: base.layers.map((layer) =>
          layer.name === "retrieval"
            ? {
                ...layer,
                skipped:
                  "no --report-id and case has no source.reportId",
              }
            : layer
        ),
      });
      continue;
    }
    const { results } = await searchReportDocumentsDetailed({
      reportId,
      query: entry.input.query ?? "",
      limit: 10,
    });
    const ranked = results.map((hit) => ({
      filename: hit.filename,
      pageNumber: hit.pageNumber,
      text: hit.text,
    }));
    const retrieval = scoreReportEvalRetrieval(entry, ranked);
    const layers = base.layers.map((layer) =>
      layer.name === "retrieval" ? retrieval : layer
    );
    const scored = layers.filter((layer) => !layer.skipped);
    const failures = scored.flatMap((layer) =>
      layer.failures.map((row) => `${layer.name}: ${row}`)
    );
    scores.push({
      ...base,
      layers,
      failures,
      passed: scored.every((layer) => layer.passed),
    });
  }
  return scores;
}

async function main(): Promise<void> {
  const args = parseReportEvalArgs(process.argv.slice(2));

  if (args.captureReportId) {
    const captured = await captureReport({
      reportId: args.captureReportId,
      section: args.section,
    });
    if (captured.length === 0) {
      throw new Error(
        "Capture wrote no cases. Draft a section with Citations: [filename, p. N], then retry."
      );
    }
    const outPath = writeLocalOverlay(captured);
    console.log(`wrote ${captured.length} case(s) to ${outPath}`);
    console.log(
      "Edit passCriteria if needed, then pnpm report-eval -- --replay. Overlay stays gitignored."
    );
    return;
  }

  const cases = loadReportEvalCases();

  if (args.dryRun && !args.replay && !args.sync && !args.experiment && !args.search) {
    console.log(`report-eval dry-run: ${cases.length} case(s)`);
    for (const entry of cases) {
      console.log(
        `  ${entry.input.documentType.padEnd(28)} ${entry.input.section.padEnd(22)} ${entry.id}`
      );
    }
    return;
  }

  let scores: ReportEvalCaseScore[] = [];
  if (args.search) {
    scores = await runSearch({ cases, reportId: args.reportId });
    printScores(scores);
    const outPath = writeRun(scores);
    console.log(`wrote ${outPath}`);
  } else if (args.replay || args.experiment) {
    scores = replayReportEvalCases(cases);
    printScores(scores);
    const outPath = writeRun(scores);
    console.log(`wrote ${outPath}`);
  }

  const failed = scores.filter((row) => !row.passed);
  if (failed.length > 0 && !args.experiment && !args.sync) {
    process.exitCode = 1;
    console.error(`${failed.length} of ${scores.length} report-eval cases failed`);
  }

  if (args.sync || args.experiment) {
    if (!isLangfuseEnabled()) {
      console.log(missingLangfuseMessage());
      if (scores.some((row) => !row.passed)) process.exitCode = 1;
      return;
    }
    if (scores.length === 0) scores = replayReportEvalCases(cases);
    const synced = await ensureLangfuseDataset(cases);
    console.log(
      `synced ${synced.itemCount} item(s) to Langfuse dataset ${REPORT_EVAL_DATASET_NAME}`
    );
    if (args.experiment) {
      const uploaded = await runLangfuseExperiment();
      console.log(`Langfuse experiment run ${uploaded.runName}`);
      if (scores.some((row) => !row.passed)) {
        process.exitCode = 1;
        console.error("quality floor failed — Langfuse run still uploaded");
      }
    }
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
