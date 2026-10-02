import { generateText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  resolveChatExtractLanguageModel,
} from "@/lib/ai/chat/model";
import {
  isChatTurnDeadlineReached,
  remainingChatAbortMs,
} from "@/lib/ai/chat/assistant-turn";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import type { RtmIdentityRow } from "@/lib/ai/chat/rtm-identity";
import { identityRowsForChecklist } from "@/lib/ai/chat/rtm-identity";
import type { RtmUrsPage } from "@/lib/ai/chat/rtm-draft-plan";
import {
  RTM_WORKER_BUDGET_MS,
  RTM_WORKER_MIN_START_MS,
  withRtmWorkerSlot,
} from "@/lib/ai/chat/rtm-worker-pool";

export function skipRtmLlmWorkers(): boolean {
  return isTestStubChat() || process.env.VITEST === "true";
}

export type RtmIdentityJobInput = {
  reportId: string;
  ursIds: readonly string[];
  ursPages: readonly RtmUrsPage[];
  tools?: ToolSet;
  abortSignal?: AbortSignal;
  turnStartedAtMs?: number;
};

export type RtmIdentityJobResult = {
  status: "ok" | "partial" | "error";
  rows: RtmIdentityRow[];
  notFound: string[];
  message?: string;
};

function identityTranscript(pages: readonly RtmUrsPage[]): string {
  if (pages.length === 0) return "No reviewed URS pages.";
  return pages
    .map(
      (page) =>
        `--- ${page.filename} p. ${page.pageNumber} ---\n${page.quote}`
    )
    .join("\n\n");
}

export async function runRtmIdentityJob(
  input: RtmIdentityJobInput
): Promise<RtmIdentityJobResult> {
  const deterministic = identityRowsForChecklist({
    ursIds: input.ursIds,
    pages: input.ursPages,
  });
  if (skipRtmLlmWorkers() || !input.tools) {
    return {
      status: deterministic.notFound.length > 0 ? "partial" : "ok",
      rows: deterministic.rows,
      notFound: deterministic.notFound,
    };
  }
  if (
    input.abortSignal?.aborted ||
    (input.turnStartedAtMs != null &&
      remainingChatAbortMs(input.turnStartedAtMs) < RTM_WORKER_MIN_START_MS)
  ) {
    return {
      status: "partial",
      rows: deterministic.rows,
      notFound: deterministic.notFound,
      message: "Turn budget elapsed before identity enrich.",
    };
  }

  const filled = new Map(
    deterministic.rows.map((row) => [row.ursId.toUpperCase(), row])
  );
  const submitSchema = z.object({
    rows: z.array(
      z.object({
        ursId: z.string(),
        parameters: z.string(),
        userRequirement: z.string(),
        citation: z.string(),
      })
    ),
  });
  const workerTools: ToolSet = {
    ...input.tools,
    submit_identity_rows: tool({
      description:
        "Submit one row per checklist URS ID. Copy Parameters and User requirements from the URS transcript. Do not invent IDs.",
      inputSchema: submitSchema,
      execute: async ({ rows }) => {
        for (const row of rows) {
          const id = row.ursId.trim().toUpperCase();
          if (!id.startsWith("URS-")) continue;
          const previous = filled.get(id);
          filled.set(id, {
            ursId: id,
            parameters: row.parameters.trim() || previous?.parameters || "",
            userRequirement:
              row.userRequirement.trim() || previous?.userRequirement || "",
            citation: row.citation.trim() || previous?.citation || "",
          });
        }
        return { status: "ok", count: filled.size };
      },
    }),
  };

  return withRtmWorkerSlot(async () => {
    const startedAtMs = Date.now();
    const deadlineStart = input.turnStartedAtMs ?? startedAtMs;
    try {
      await assertAiBudgetAvailable();
      await generateText({
        model: resolveChatExtractLanguageModel(),
        system: [
          "You fill QSR RTM identity columns from reviewed URS transcripts.",
          "Return every checklist ID via submit_identity_rows.",
          "Copy wording from the transcript. Do not invent ranges or IDs.",
          identityTranscript(input.ursPages),
        ].join("\n\n"),
        prompt: `Checklist URS IDs:\n${input.ursIds.join("\n")}`,
        tools: workerTools,
        experimental_repairToolCall: repairChatToolCall,
        stopWhen: async () => {
          if (input.abortSignal?.aborted) return true;
          if (isChatTurnDeadlineReached(deadlineStart)) return true;
          if (Date.now() - startedAtMs >= RTM_WORKER_BUDGET_MS) return true;
          return input.ursIds.every((id) => filled.has(id.toUpperCase()));
        },
        abortSignal: input.abortSignal,
        timeout: {
          totalMs: Math.min(
            RTM_WORKER_BUDGET_MS,
            Math.max(1, remainingChatAbortMs(deadlineStart))
          ),
        },
        providerOptions: buildGeminiThoughtSummaryProviderOptions({
          thinkingLevel: "minimal",
          includeThoughts: false,
        }),
        ...langfuseGenerateTextTelemetry({
          functionId: "report-rtm-identity",
          metadata: {
            feature: "report_chat",
            reportId: input.reportId,
            checklistSize: input.ursIds.length,
          },
        }),
      }).then(async (result) => {
        await recordAiUsage({
          feature: "report_chat",
          modelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
          usage: result.usage,
          reportId: input.reportId,
        });
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Identity worker failed.";
      return {
        status: "error",
        rows: [...filled.values()],
        notFound: input.ursIds.filter((id) => !filled.has(id.toUpperCase())),
        message,
      };
    }
    const notFound = input.ursIds.filter((id) => !filled.has(id.toUpperCase()));
    return {
      status: notFound.length > 0 ? "partial" : "ok",
      rows: [...filled.values()],
      notFound,
    };
  });
}
