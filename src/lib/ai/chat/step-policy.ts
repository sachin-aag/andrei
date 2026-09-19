import {
  alreadyDraftedReadStep,
  withoutDraftFieldTools,
} from "@/lib/ai/chat/already-drafted";
import {
  prepareDocumentReviewStep,
  type DocumentReviewPhase,
} from "@/lib/ai/chat/document-review";
import type { RetrievalPolicy } from "@/lib/ai/chat/retrieval-policy";
import {
  documentAskUserDirective,
  searchLoopDirective,
  type SearchGate,
  type SearchLoopStep,
  withoutAskUserTool,
  withoutSearchTool,
} from "@/lib/ai/chat/search-loop";
import { tableSchemaReadStep } from "@/lib/ai/chat/table-schema";
import {
  tableEditLoopDirective,
  type ChatStepWithTools,
} from "@/lib/ai/chat/table-edit-loop";
import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";

export type ChatStepToolChoice = {
  type: "tool";
  toolName: string;
};

export type ChatStepDecision = {
  activeTools: string[];
  toolChoice?: ChatStepToolChoice;
};

export type PrepareReportChatStepInput = {
  advertisedTools: readonly string[];
  steps: readonly SearchLoopStep[];
  userIntentKind: ChatUserIntentKind;
  alreadyDrafted: boolean;
  hasReadSectionTool: boolean;
  inScopeHasTable: boolean;
  retrievalPolicy: RetrievalPolicy;
  reviewPhase: DocumentReviewPhase;
  requireInventoryReview: boolean;
  /**
   * Coverage is a different inventory (or none). Truncated matching finishes
   * keep requireInventoryReview for the edit_table lock but must not restart.
   * Omit to use requireInventoryReview as the complete-phase restart signal.
   */
  restartInventoryReview?: boolean;
  searchGate?: SearchGate;
  /**
   * E2: when the last start_document_review returned needs_attachment_scope,
   * force list_attachments instead of emitting advice the model ignored.
   * Off unless the caller sets it — characterization of today's chain stays equal.
   */
  forceListAttachments?: boolean;
  /**
   * E3: remaining continue budget is gone — finish the review truncated
   * instead of starting another continue that will hit the 270s abort.
   */
  forceFinishReview?: boolean;
};

function asTableEditSteps(
  steps: readonly SearchLoopStep[]
): ChatStepWithTools[] {
  return steps.map((step) => ({
    toolCalls: (step.toolCalls ?? []).flatMap((call) => {
      const toolName =
        typeof call.toolName === "string"
          ? call.toolName
          : typeof call.tool === "string"
            ? call.tool
            : "";
      if (!toolName) return [];
      const record = call as ToolCallLikeWithId;
      return [
        {
          toolCallId:
            typeof record.toolCallId === "string" ? record.toolCallId : "",
          toolName,
        },
      ];
    }),
    toolResults: (step.toolResults ?? []).flatMap((result) => {
      const toolName =
        typeof result.toolName === "string"
          ? result.toolName
          : typeof result.tool === "string"
            ? result.tool
            : "";
      if (!toolName) return [];
      const record = result as ToolCallLikeWithId;
      return [
        {
          toolCallId:
            typeof record.toolCallId === "string" ? record.toolCallId : "",
          toolName,
          output: result.output ?? result.result,
        },
      ];
    }),
  }));
}

type ToolCallLikeWithId = {
  toolCallId?: unknown;
  toolName?: unknown;
  tool?: unknown;
};

function payloadStatus(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const status = (output as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

/** True when the latest start_document_review this turn asked for a file set. */
export function lastStartNeedsAttachmentScope(
  steps: readonly SearchLoopStep[]
): boolean {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step) continue;
    for (const result of step.toolResults ?? []) {
      const name =
        typeof result.toolName === "string"
          ? result.toolName
          : typeof result.tool === "string"
            ? result.tool
            : "";
      if (name !== "start_document_review") continue;
      return payloadStatus(result.output ?? result.result) ===
        "needs_attachment_scope";
    }
  }
  return false;
}

/**
 * Single control plane for report-chat `prepareStep`. The seven former gates
 * run in the same order as the route chain they replaced; characterization
 * tests lock `activeTools` / `toolChoice` equality.
 */
export function prepareReportChatStep(
  input: PrepareReportChatStepInput
): ChatStepDecision {
  if (input.userIntentKind === "social") {
    return { activeTools: [] };
  }

  const tableEditDirective = tableEditLoopDirective(
    asTableEditSteps(input.steps)
  );
  if (tableEditDirective === "finish") {
    return { activeTools: [] };
  }
  if (tableEditDirective === "reread" && input.hasReadSectionTool) {
    return {
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    };
  }

  const alreadyDraftedStep = alreadyDraftedReadStep({
    stepsTaken: input.steps.length,
    alreadyDrafted: input.alreadyDrafted,
    hasReadSectionTool: input.hasReadSectionTool,
  });
  if (alreadyDraftedStep) return alreadyDraftedStep;

  const schemaStep = tableSchemaReadStep({
    stepsTaken: input.steps.length,
    isWrite: input.userIntentKind === "write",
    hasReadSectionTool: input.hasReadSectionTool,
    inScopeHasTable: input.inScopeHasTable,
  });
  if (schemaStep) return schemaStep;

  if (
    input.forceListAttachments &&
    input.advertisedTools.includes("list_attachments")
  ) {
    return {
      activeTools: ["list_attachments"],
      toolChoice: { type: "tool", toolName: "list_attachments" },
    };
  }

  if (
    input.forceFinishReview &&
    (input.reviewPhase === "in_progress" ||
      input.reviewPhase === "ready_to_finish") &&
    input.advertisedTools.includes("finish_document_review")
  ) {
    return {
      activeTools: ["finish_document_review"],
      toolChoice: { type: "tool", toolName: "finish_document_review" },
    };
  }

  const prepared = prepareDocumentReviewStep({
    policy: input.alreadyDrafted ? "adaptive" : input.retrievalPolicy,
    phase: input.reviewPhase,
    availableTools: input.advertisedTools,
    requireInventoryReview: input.alreadyDrafted
      ? false
      : input.requireInventoryReview,
    restartInventoryReview: input.alreadyDrafted
      ? false
      : (input.restartInventoryReview ?? input.requireInventoryReview),
  });
  const reviewActive =
    input.reviewPhase === "in_progress" ||
    input.reviewPhase === "ready_to_finish";
  const searchDirective = searchLoopDirective(input.steps);
  if (searchDirective === "read" && input.searchGate) {
    input.searchGate.closed = true;
  }
  const hideAskUser =
    !reviewActive && documentAskUserDirective(input.steps) === "hide";
  const applyLoopHides = (tools: readonly string[]): string[] => {
    let next = [...tools];
    if (!reviewActive && searchDirective === "read") {
      next = withoutSearchTool(next);
    }
    if (hideAskUser) {
      next = withoutAskUserTool(next);
    }
    return next;
  };
  if (!prepared) {
    let activeTools = applyLoopHides(input.advertisedTools);
    if (input.alreadyDrafted) {
      activeTools = withoutDraftFieldTools(activeTools);
    }
    return { activeTools };
  }
  let activeTools = input.alreadyDrafted
    ? withoutDraftFieldTools(prepared.activeTools)
    : prepared.activeTools;
  activeTools = applyLoopHides(activeTools);
  return {
    activeTools,
    ...(prepared.toolChoice
      ? {
          toolChoice: {
            type: "tool" as const,
            toolName: prepared.toolChoice.toolName,
          },
        }
      : {}),
  };
}
