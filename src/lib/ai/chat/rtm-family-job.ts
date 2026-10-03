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
import {
  rtmSectionCellText,
  type QsrRtmSection,
  type RtmStageFamily,
} from "@/lib/ai/chat/qsr-row-grounding";
import type { RtmIdentityRow } from "@/lib/ai/chat/rtm-identity";
import type { RtmFamilyCell, RtmFamilyCells } from "@/lib/ai/chat/rtm-compose";
import { skipRtmLlmWorkers } from "@/lib/ai/chat/rtm-identity-job";
import {
  RTM_WORKER_BUDGET_MS,
  RTM_WORKER_MIN_START_MS,
  withRtmWorkerSlot,
} from "@/lib/ai/chat/rtm-worker-pool";

const FAMILY_LABEL: Record<RtmStageFamily, string> = {
  dq: "Design Qualification (DQ)",
  iq: "Installation Qualification (IQ)",
  oq: "Operational Qualification (OQ)",
  pq: "Performance Qualification (PQ)",
};

export type RtmFamilyJobInput = {
  reportId: string;
  section: QsrRtmSection;
  family: RtmStageFamily;
  rows: readonly RtmIdentityRow[];
  tools: ToolSet;
  attachmentIds?: readonly string[];
  abortSignal?: AbortSignal;
  turnStartedAtMs?: number;
};

export async function runRtmFamilyJob(
  input: RtmFamilyJobInput
): Promise<RtmFamilyCells & { status: "ok" | "partial" | "error"; message?: string }> {
  const empty: RtmFamilyCells = { family: input.family, cells: [] };
  if (skipRtmLlmWorkers()) {
    return { ...empty, status: "ok" };
  }
  if (input.rows.length === 0) {
    return { ...empty, status: "ok" };
  }
  if (
    input.abortSignal?.aborted ||
    (input.turnStartedAtMs != null &&
      remainingChatAbortMs(input.turnStartedAtMs) < RTM_WORKER_MIN_START_MS)
  ) {
    return {
      ...empty,
      status: "partial",
      message: `Ran out of time before starting ${input.family.toUpperCase()}.`,
    };
  }

  const submitted = new Map<string, RtmFamilyCell>();
  const workerTools: ToolSet = {
    ...input.tools,
    submit_family_cells: tool({
      description: `Submit the ${input.family.toUpperCase()} cell for every URS ID. Empty string = leave blank. NA = searched, not found. Text is "{section number} – {one audit line}".`,
      inputSchema: z.object({
        cells: z.array(
          z.object({
            ursId: z.string(),
            text: z.string(),
            citation: z.string(),
          })
        ),
      }),
      execute: async ({ cells }) => {
        for (const cell of cells) {
          const id = cell.ursId.trim().toUpperCase();
          if (!id.startsWith("URS-")) continue;
          const cleaned = rtmSectionCellText(cell.text, {
            family: input.family,
          });
          const marker = cell.text.replace(/\[[^\]]*\]/g, "").trim();
          const text =
            /^n\/?a$/i.test(marker) || /^n\.a\.$/i.test(marker)
              ? "NA"
              : cleaned;
          submitted.set(id, {
            ursId: id,
            text,
            citation: text ? cell.citation.trim() : "",
          });
        }
        return { status: "ok", count: submitted.size };
      },
    }),
  };

  const rowList = input.rows
    .map(
      (row) =>
        `${row.ursId}\t${row.parameters}\t${row.userRequirement}`
    )
    .join("\n");

  return withRtmWorkerSlot(async () => {
    const startedAtMs = Date.now();
    const deadlineStart = input.turnStartedAtMs ?? startedAtMs;
    try {
      await assertAiBudgetAvailable();
      const result = await generateText({
        model: resolveChatExtractLanguageModel(),
        system: [
          `You fill the Reference – ${input.family.toUpperCase()} column of a QSR RTM table.`,
          `Search only the attached ${FAMILY_LABEL[input.family]} protocol.`,
          "Each cell is `{dotted section number} – {one audit line}` (about 18 words).",
          "Example: `12.1 – Capacity verified as 8000 L`. Bare `Section 8` or `13.2` is invalid.",
          "Cover / contents pages (Page 1 of N, table of contents, divider=true) are not evidence.",
          "Grep the parameter, then read_document_page on a body page that prints the dotted heading and the test. If every hit is divider=true, read nextPage.",
          "Cite that body page, not the cover. Do not copy page counters, logged readings, running headers, or dates.",
          "If the protocol was searched and the parameter is absent, submit NA.",
          "If you did not search that row, submit an empty string.",
          "Call submit_family_cells with every checklist URS ID.",
        ].join("\n"),
        prompt: [
          `Section: ${input.section}`,
          `Family: ${input.family.toUpperCase()}`,
          input.attachmentIds?.length
            ? `Attachment ids: ${input.attachmentIds.join(", ")}`
            : "No matching protocol attachment — submit empty cells.",
          "URS rows:",
          rowList,
        ].join("\n"),
        tools: workerTools,
        experimental_repairToolCall: repairChatToolCall,
        stopWhen: async () => {
          if (input.abortSignal?.aborted) return true;
          if (isChatTurnDeadlineReached(deadlineStart)) return true;
          if (Date.now() - startedAtMs >= RTM_WORKER_BUDGET_MS) return true;
          return input.rows.every((row) => submitted.has(row.ursId));
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
          functionId: "report-rtm-family",
          metadata: {
            feature: "document_chat",
            reportId: input.reportId,
            section: input.section,
            family: input.family,
            checklistSize: input.rows.length,
          },
        }),
      });
      await recordAiUsage({
        feature: "document_chat",
        modelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
        usage: result.usage,
        reportId: input.reportId,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : `${input.family.toUpperCase()} worker failed.`;
      return {
        family: input.family,
        cells: [...submitted.values()],
        status: "error",
        message,
      };
    }
    const cells = [...submitted.values()];
    const complete = input.rows.every((row) => submitted.has(row.ursId));
    return {
      family: input.family,
      cells,
      status: complete ? "ok" : "partial",
    };
  });
}
