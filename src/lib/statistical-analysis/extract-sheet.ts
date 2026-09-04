import { generateText, type ToolSet } from "ai";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  resolveChatExtractLanguageModel,
} from "@/lib/ai/chat/model";
import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import { remainingChatAbortMs } from "@/lib/ai/chat/assistant-turn";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import {
  assertAiBudgetAvailable,
  recordAiUsage,
} from "@/lib/ai/usage";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import {
  analyticsSheetJobComplete,
  createAnalyticsSearchGate,
  prepareAnalyticsChatStep,
  type AnalyticsChatStep,
} from "./search-loop";
import { callToolName, toolPayload, unwrapToolPayload } from "@/lib/ai/chat/search-loop";

/** In-flight sheet extract workers. Same idea as document-review extract pool. */
export const EXTRACT_SHEET_CONCURRENCY = 4;

const SHEET_EXTRACT_BUDGET_MS = 180_000;

export type SheetExtractJobMode = "extract" | "edit";

export type SheetExtractJobInput = {
  reportId: string;
  tools: ToolSet;
  sheetName: string;
  objective: string;
  mode?: SheetExtractJobMode;
  sheetId?: string;
  attachmentId?: string;
  filenameContains?: string;
  pages?: readonly number[];
  metric?: string;
  abortSignal?: AbortSignal;
};

export type SheetExtractColumn = {
  name: string;
  rowsWritten: number;
};

export type SheetExtractResult = {
  status: "written" | "edited" | "incomplete" | "error" | "stub";
  sheetName: string;
  sheetId?: string;
  rowsWritten?: number;
  columns?: SheetExtractColumn[];
  message: string;
  stepCount?: number;
};

const waiters: Array<() => void> = [];
let inflight = 0;

export async function withSheetExtractSlot<T>(
  task: () => Promise<T>
): Promise<T> {
  if (inflight >= EXTRACT_SHEET_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  inflight += 1;
  try {
    return await task();
  } finally {
    inflight -= 1;
    waiters.shift()?.();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function writeRecordFromOutput(output: unknown): Record<string, unknown> | null {
  const payload = unwrapToolPayload(output);
  return isRecord(payload) ? payload : null;
}

function columnsFromWrite(record: Record<string, unknown>): SheetExtractColumn[] {
  const columns = Array.isArray(record.columns) ? record.columns : [];
  return columns.flatMap((column) => {
    if (!isRecord(column)) return [];
    const name =
      typeof column.columnName === "string"
        ? column.columnName
        : typeof column.name === "string"
          ? column.name
          : "";
    const rowsWritten =
      typeof column.rowsWritten === "number"
        ? column.rowsWritten
        : typeof column.valueCount === "number"
          ? column.valueCount
          : 0;
    if (!name) return [];
    return [{ name, rowsWritten }];
  });
}

function manageEditFromRecord(
  record: Record<string, unknown>,
  sheetName: string
): SheetExtractResult | null {
  if (record.status !== "ok") return null;
  const actions = [
    typeof record.action === "string" ? record.action : null,
    ...(Array.isArray(record.operations)
      ? record.operations.flatMap((operation) => {
          if (!isRecord(operation) || typeof operation.action !== "string") {
            return [];
          }
          return [operation.action];
        })
      : []),
  ].filter((action): action is string => Boolean(action));
  const edited = actions.some(
    (action) =>
      action === "delete_row" || action === "add_row" || action === "set_cell"
  );
  if (!edited) return null;
  const nextName =
    typeof record.sheetName === "string" && record.sheetName.trim()
      ? record.sheetName
      : sheetName;
  const sheetId =
    typeof record.sheetId === "string" && record.sheetId.trim()
      ? record.sheetId
      : undefined;
  return {
    status: "edited",
    sheetName: nextName,
    sheetId,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message
        : `Updated ${nextName}.`,
  };
}

export function sheetExtractResultFromSteps(
  steps: readonly AnalyticsChatStep[],
  sheetName: string
): SheetExtractResult | null {
  let latest: SheetExtractResult | null = null;
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      const toolName = callToolName(result);
      const record = writeRecordFromOutput(toolPayload(result));
      if (!record) continue;
      if (toolName === "manage_worksheet") {
        const edited = manageEditFromRecord(record, sheetName);
        if (edited) latest = edited;
        continue;
      }
      if (toolName !== "write_column") continue;
      const columns = columnsFromWrite(record);
      const rowsWritten =
        typeof record.rowsWritten === "number"
          ? record.rowsWritten
          : columns.reduce((sum, column) => sum + column.rowsWritten, 0);
      const nextName =
        typeof record.sheetName === "string" && record.sheetName.trim()
          ? record.sheetName
          : sheetName;
      const sheetId =
        typeof record.sheetId === "string" && record.sheetId.trim()
          ? record.sheetId
          : undefined;
      if (record.status === "written" && record.incomplete !== true) {
        latest = {
          status: "written",
          sheetName: nextName,
          sheetId,
          rowsWritten,
          columns,
          message:
            record.mode === "append"
              ? `Appended rows on ${nextName} (${rowsWritten} rows now).`
              : `Wrote ${rowsWritten} rows to ${nextName}.`,
        };
        continue;
      }
      if (record.status === "incomplete" || record.incomplete === true) {
        latest = {
          status: "incomplete",
          sheetName: nextName,
          sheetId,
          rowsWritten: 0,
          columns,
          message:
            typeof record.message === "string" && record.message.trim()
              ? record.message
              : "Sheet extract did not persist — gather remaining pages and write once.",
        };
      }
    }
  }
  return latest;
}

export function buildSheetWorkerPrompt(input: SheetExtractJobInput): string {
  const locator = [
    input.attachmentId
      ? `attachmentId=${sanitizePromptMetadata(input.attachmentId, 80)}`
      : null,
    input.filenameContains
      ? `filenameContains=${sanitizePromptMetadata(input.filenameContains, 80)}`
      : null,
    input.pages && input.pages.length > 0
      ? `pages=${input.pages.join(",")}`
      : null,
    input.metric
      ? `metric=${sanitizePromptMetadata(input.metric, 80)}`
      : null,
    input.sheetId
      ? `existing sheetId=${sanitizePromptMetadata(input.sheetId, 80)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const sheetName = sanitizePromptMetadata(input.sheetName, 80) || "Data";
  const job =
    sanitizePromptMetadata(input.objective, 400) ||
    (input.mode === "edit"
      ? "Edit the assigned sheet."
      : "Extract the named table.");
  if (input.mode === "edit") {
    return [
      "You edit ONE existing worksheet sheet for Andrei Analytics.",
      `Assigned sheet name: ${sheetName}`,
      `Job: ${job}`,
      locator || null,
      "Read this sheet with read_worksheet first (pass the assigned sheet name as sheetId). Reuse this sheet — if you call add_sheet, use the assigned name so it reuses the existing tab. Do not create a second tab with the same name. Do not rename or delete other sheets.",
      "If they asked to remove rows: one manage_worksheet with delete_row (row + optional rowEnd for an inclusive range) or operations for several ranges. Always pass the assigned sheet name as sheetId.",
      "If they asked to add blank rows: add_row with optional count (row inserts at that position).",
      "If they asked to add measurements from a file: pull every remaining page of that series, then one write_column with mode append and sheetId. Do not use replace — that wipes existing rows.",
      "If they asked to replace a column entirely, write_column mode replace is OK.",
      "Write the complete added rows once; write_column persists the provided batch atomically without per-cell source-token verification.",
      "Do not plot. Do not ask the engineer questions. If a needed id is missing, finish with a short error in your last message.",
      "Reply with one short sentence after a successful edit (what changed).",
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n");
  }
  return [
    "You extract ONE table onto ONE worksheet sheet for Andrei Analytics.",
    `Assigned sheet name: ${sheetName}`,
    `Job: ${job}`,
    locator || null,
    "Create this sheet with manage_worksheet add_sheet if it does not already exist. Use the assigned name. If a sheet with this name already exists, reuse it — do not create a second tab with the same name. Do not rename or delete other sheets.",
    "Pull every page that contains THIS table or series. If extract_numeric_series returns morePages true, or scan_attachments returns truncated true, keep reading those pages.",
      "Then one write_column to this sheet only (mode replace). Always pass the assigned sheet name as sheetId. Agent writes do not switch the focused tab — omitting sheetId writes the engineer's current tab. Do not write other sheets. Do not invent cells. In your reply, use that tab name — not an internal id.",
    "Write the complete table once; write_column persists the provided batch atomically without per-cell source-token verification.",
    "Do not plot. Do not ask the engineer questions. If a needed id is missing, finish with a short error in your last message.",
    "Reply with one short sentence after a successful write (sheet name, columns, rowsWritten).",
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

async function documentIndexLine(reportId: string): Promise<string> {
  const documents = await listReadyDocumentsForReport(reportId);
  if (documents.length === 0) return "Ready documents: none.";
  return [
    "Ready documents:",
    ...documents.map((doc) => {
      const filename =
        sanitizePromptMetadata(doc.filename, 180) || "unnamed";
      return `- ${filename} (${doc.pageCount ?? "?"} pages) [id=${doc.attachmentId}]`;
    }),
  ].join("\n");
}

export async function runSheetExtractJob(
  input: SheetExtractJobInput
): Promise<SheetExtractResult> {
  const sheetName = input.sheetName.trim() || "Data";
  if (isTestStubChat()) {
    return {
      status: "stub",
      sheetName,
      sheetId: input.sheetId,
      message:
        "Stub extract_sheet — no worksheet write. Parallel sheet jobs are skipped in stub chat.",
    };
  }

  return withSheetExtractSlot(async () => {
    const startedAtMs = Date.now();
    const searchGate = createAnalyticsSearchGate();
    const jobMode: SheetExtractJobMode = input.mode === "edit" ? "edit" : "extract";
    const system = [
      buildSheetWorkerPrompt({ ...input, mode: jobMode }),
      await documentIndexLine(input.reportId),
    ].join("\n\n");
    try {
      await assertAiBudgetAvailable();
      const result = await generateText({
        model: resolveChatExtractLanguageModel(),
        system,
        prompt:
          jobMode === "edit"
            ? `Edit "${sheetName}" now. ${input.objective}`
            : `Extract "${sheetName}" now. ${input.objective}`,
        tools: input.tools,
        experimental_repairToolCall: repairChatToolCall,
        stopWhen: async ({ steps }) => {
          if (input.abortSignal?.aborted) return true;
          if (Date.now() - startedAtMs >= SHEET_EXTRACT_BUDGET_MS) return true;
          return analyticsSheetJobComplete(steps as AnalyticsChatStep[], {
            allowManageEdit: jobMode === "edit",
          });
        },
        prepareStep: ({ steps }) => {
          const prepared = prepareAnalyticsChatStep({
            steps: steps as AnalyticsChatStep[],
            canEdit: true,
            searchGate,
            intent: "write",
            sheetJob: jobMode,
          });
          if (!prepared) return undefined;
          return {
            activeTools: prepared.activeTools.filter(
              (name) => name !== "extract_sheet" && name !== "ask_user"
            ),
            ...(prepared.toolChoice
              ? { toolChoice: prepared.toolChoice }
              : {}),
          };
        },
        abortSignal: input.abortSignal,
        timeout: {
          totalMs: Math.min(
            SHEET_EXTRACT_BUDGET_MS,
            Math.max(1, remainingChatAbortMs(startedAtMs))
          ),
        },
        providerOptions: buildGeminiThoughtSummaryProviderOptions({
          thinkingLevel: "minimal",
          includeThoughts: false,
        }),
        ...langfuseGenerateTextTelemetry({
          functionId: "analytics-extract-sheet",
          metadata: {
            feature: "analytics_chat",
            reportId: input.reportId,
            sheetName,
            sheetId: input.sheetId ?? null,
          },
        }),
      });
      await recordAiUsage({
        feature: "analytics_chat",
        modelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
        usage: result.usage,
        reportId: input.reportId,
      });
      const fromSteps = sheetExtractResultFromSteps(
        result.steps as AnalyticsChatStep[],
        sheetName
      );
      if (fromSteps) {
        return { ...fromSteps, stepCount: result.steps.length };
      }
      const text = result.text?.trim();
      return {
        status: "error",
        sheetName,
        sheetId: input.sheetId,
        stepCount: result.steps.length,
        message:
          text ||
          (jobMode === "edit"
            ? "Sheet edit finished without a write or row change."
            : "Sheet extract finished without a complete write_column."),
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Sheet extract failed.";
      return {
        status: "error",
        sheetName,
        sheetId: input.sheetId,
        message,
      };
    }
  });
}
