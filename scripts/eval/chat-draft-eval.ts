/**
 * Chat-draft quality-floor eval.
 *
 *   pnpm chat-eval -- --dry-run
 *   pnpm chat-eval -- --replay
 *   pnpm chat-eval -- --sync
 *   pnpm chat-eval -- --experiment
 *
 * Git owns the cases (`scripts/eval/chat-draft-cases.json`). Langfuse holds
 * the dataset + experiment runs so prompt/gate changes can be compared in
 * the Datasets UI. `--replay` is the merge gate (no LLM, no Langfuse keys).
 * `--experiment` upserts the hosted dataset then `runExperiment`.
 * `--sync` / `--experiment` skip cleanly when LANGFUSE_* keys are missing.
 * Live Gemini Agent turns are not wired yet (`--live` errors on purpose).
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Evaluator, RunEvaluator } from "@langfuse/client";
import { CHAT_PROMPT_VERSION } from "@/lib/ai/chat/system-prompt";
import { isLangfuseEnabled } from "@/lib/observability/langfuse";
import {
  CHAT_DRAFT_DATASET_NAME,
  mergeChatDraftCases,
  parseChatDraftCases,
  parseChatDraftEvalArgs,
  replayChatDraftCases,
  runChatDraftCase,
  scoreChatDraftCase,
  type ChatDraftCaseScore,
  type ChatDraftEvalCase,
} from "@/lib/eval/chat-draft-cases";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_CASES = path.join(here, "chat-draft-cases.json");
const LOCAL_CASES = path.join(here, "chat-draft-cases.local.json");
const RUNS_DIR = path.join(here, "chat-draft-runs");

export function loadChatDraftEvalCases(): ChatDraftEvalCase[] {
  const publicCases = parseChatDraftCases(
    JSON.parse(fs.readFileSync(PUBLIC_CASES, "utf8"))
  );
  if (!fs.existsSync(LOCAL_CASES)) return publicCases;
  const overlayCases = parseChatDraftCases(
    JSON.parse(fs.readFileSync(LOCAL_CASES, "utf8"))
  );
  const merged = mergeChatDraftCases(publicCases, overlayCases);
  console.log(
    `merged chat-draft-cases.local.json (${overlayCases.length} overlay case(s), ${merged.length} total)`
  );
  return merged;
}

function printScores(scores: ChatDraftCaseScore[]): void {
  for (const score of scores) {
    const mark = score.passed ? "pass" : "FAIL";
    const detail = score.failures.length > 0 ? ` — ${score.failures.join("; ")}` : "";
    console.log(`  ${mark}  ${score.id}${detail}`);
  }
}

function writeRun(scores: ChatDraftCaseScore[]): string {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outPath = path.join(RUNS_DIR, `${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        promptVersion: CHAT_PROMPT_VERSION,
        dataset: CHAT_DRAFT_DATASET_NAME,
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
  cases: ChatDraftEvalCase[]
): Promise<{ hosted: boolean; itemCount: number }> {
  const { LangfuseClient } = await import("@langfuse/client");
  const client = new LangfuseClient();
  try {
    await client.api.datasets.create({
      name: CHAT_DRAFT_DATASET_NAME,
      description:
        "Git-owned chat draft quality floor (QSR section 5 grounding + layer-1 harness). Source: scripts/eval/chat-draft-cases.json.",
    });
    console.log(`created Langfuse dataset ${CHAT_DRAFT_DATASET_NAME}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/already exists|409|conflict/i.test(message)) throw err;
    console.log(`Langfuse dataset ${CHAT_DRAFT_DATASET_NAME} already exists`);
  }

  const syncable = cases.filter((entry) => entry.task !== "live");
  for (const entry of syncable) {
    await client.dataset.createItem({
      datasetName: CHAT_DRAFT_DATASET_NAME,
      id: entry.id,
      input: entry,
      expectedOutput: entry.expected,
      metadata: {
        task: entry.task,
        passCriteria: entry.passCriteria,
        notes: entry.notes ?? "",
        promptVersion: CHAT_PROMPT_VERSION,
      },
    });
  }
  await client.flush();
  await client.shutdown();
  return { hosted: true, itemCount: syncable.length };
}

const qualityFloorEvaluator: Evaluator = async ({ output }) => {
  const score = output as ChatDraftCaseScore;
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
    const dataset = await client.dataset.get(CHAT_DRAFT_DATASET_NAME);
    const result = await dataset.runExperiment({
      name: CHAT_DRAFT_DATASET_NAME,
      runName,
      description: `Deterministic chat quality floor at ${CHAT_PROMPT_VERSION}`,
      metadata: {
        promptVersion: CHAT_PROMPT_VERSION,
        source: "scripts/eval/chat-draft-cases.json",
      },
      maxConcurrency: 4,
      task: async (item) => {
        const entry = item.input as ChatDraftEvalCase;
        if (!entry?.id || !entry.task) {
          throw new Error("Langfuse dataset item is missing a chat-draft case");
        }
        return scoreChatDraftCase(entry, runChatDraftCase(entry));
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

async function main(): Promise<void> {
  const args = parseChatDraftEvalArgs(process.argv.slice(2));
  const cases = loadChatDraftEvalCases();

  if (args.dryRun && !args.replay && !args.sync && !args.experiment) {
    console.log(`chat-eval dry-run: ${cases.length} case(s)`);
    for (const entry of cases) {
      console.log(`  ${entry.task.padEnd(12)} ${entry.id}`);
    }
    return;
  }

  let scores: ChatDraftCaseScore[] = [];
  if (args.replay || args.experiment) {
    scores = replayChatDraftCases(cases);
    printScores(scores);
    const outPath = writeRun(scores);
    console.log(`wrote ${outPath}`);
    const failed = scores.filter((row) => !row.passed);
    if (failed.length > 0 && !args.experiment && !args.sync) {
      process.exitCode = 1;
      console.error(`${failed.length} of ${scores.length} chat-draft cases failed`);
    }
  }

  if (args.sync || args.experiment) {
    if (!isLangfuseEnabled()) {
      console.log(missingLangfuseMessage());
      if (scores.some((row) => !row.passed)) process.exitCode = 1;
      return;
    }
    const synced = await ensureLangfuseDataset(cases);
    console.log(
      `synced ${synced.itemCount} item(s) to Langfuse dataset ${CHAT_DRAFT_DATASET_NAME}`
    );
    if (args.experiment) {
      if (scores.length === 0) scores = replayChatDraftCases(cases);
      const uploaded = await runLangfuseExperiment();
      console.log(`Langfuse experiment run ${uploaded.runName}`);
      if (scores.some((row) => !row.passed)) {
        process.exitCode = 1;
        console.error("quality floor failed — Langfuse run still uploaded");
      }
    }
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
