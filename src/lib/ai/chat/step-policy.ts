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
  callToolName,
  collectToolCalls,
  collectToolResults,
  documentAskUserDirective,
  searchLoopDirective,
  toolPayload,
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
import { rtmDraftLoopDirective } from "@/lib/ai/chat/rtm-draft-loop";
import {
  DOCUMENT_WRITE_TOOL_SET,
  type ChatUserIntentKind,
} from "@/lib/ai/chat/user-intent";
import {
  stepsRequestedHiddenWriteTool,
  withUnlockedWriteTools,
} from "@/lib/ai/chat/unsupported-tool";

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
   * E2: when the last start_document_review returned needs_attachment_scope
   * and list_attachments has not run since, force that listing instead of
   * emitting advice the model ignored. Off unless the caller sets it.
   */
  forceListAttachments?: boolean;
  /**
   * E3: remaining continue budget is gone — finish the review truncated
   * instead of starting another continue that will hit the 270s abort.
   */
  forceFinishReview?: boolean;
  /**
   * Write tools kept registered on the ToolSet for Agent read turns so a
   * remapped `unsupported_tool` can unlock them mid-turn. Empty when they
   * were stripped from the ToolSet (Ask / social).
   */
  registeredWriteTools?: readonly string[];
  /**
   * "Insert the suggestion" / "edit the document" / the card did not land.
   * After read_section, the next step must call the write tool.
   */
  explicitDocumentEdit?: boolean;
  /**
   * Whole-field rewrite ("redraft 15.6 as MLT-1303", or "insert it" after
   * that). After read_section, force draft_field instead of piecemeal
   * edit_table — a filled multi-table 15.N box cannot be rebuilt cell by cell.
   */
  explicitSectionRewrite?: boolean;
  /**
   * Leftover 15.N heading / 15.N.1 prose after the tables already landed
   * ("go for 15.6.1", "make these", insertions failing). Force propose_edit
   * even though equipment sampling always has tables.
   */
  preferProposeEdit?: boolean;
  /**
   * Focused section is one QSR RTM table (Tables 5–10). Force
   * `draft_rtm_table` on the first write instead of `edit_table`.
   */
  inScopeRtmSection?: boolean;
};

function stepsIncludeTool(
  steps: readonly SearchLoopStep[],
  toolName: string
): boolean {
  return steps.some((step) =>
    collectToolCalls(step).some((call) => callToolName(call) === toolName)
  );
}

function toolIsAvailable(
  input: PrepareReportChatStepInput,
  toolName: string
): boolean {
  return (
    input.advertisedTools.includes(toolName) ||
    (input.registeredWriteTools ?? []).includes(toolName)
  );
}

function explicitDocumentEditWriteTool(
  input: PrepareReportChatStepInput
): string {
  if (input.inScopeRtmSection && toolIsAvailable(input, "draft_rtm_table")) {
    return "draft_rtm_table";
  }
  if (input.explicitSectionRewrite && toolIsAvailable(input, "draft_field")) {
    return "draft_field";
  }
  if (input.preferProposeEdit && toolIsAvailable(input, "propose_edit")) {
    return "propose_edit";
  }
  if (input.inScopeHasTable && toolIsAvailable(input, "edit_table")) {
    return "edit_table";
  }
  return "propose_edit";
}

/**
 * An explicit "put it in the document" turn must not end as a chat summary.
 * Step 0 reads the section. The following step calls draft_field on a
 * whole-field rewrite, draft_rtm_table when a QSR RTM table is in scope,
 * propose_edit for leftover 15.N heading/prose, edit_table when any other
 * table is in scope, otherwise propose_edit.
 */
function explicitDocumentEditStep(
  input: PrepareReportChatStepInput
): ChatStepDecision | undefined {
  if (
    !input.explicitDocumentEdit ||
    input.userIntentKind !== "write" ||
    !input.hasReadSectionTool
  ) {
    return undefined;
  }
  if (!stepsIncludeTool(input.steps, "read_section")) {
    if (input.steps.length !== 0) return undefined;
    return {
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    };
  }
  const writeTool = explicitDocumentEditWriteTool(input);
  if (
    stepsIncludeTool(input.steps, writeTool) ||
    !toolIsAvailable(input, writeTool)
  ) {
    return undefined;
  }
  return {
    activeTools: [writeTool],
    toolChoice: { type: "tool", toolName: writeTool },
  };
}

/**
 * Empty / partial RTM table: after read_section, run the dispatcher instead
 * of letting the orchestrator hand-fill family columns with edit_table.
 */
function rtmFirstWriteStep(
  input: PrepareReportChatStepInput
): ChatStepDecision | undefined {
  if (
    !input.inScopeRtmSection ||
    input.userIntentKind !== "write" ||
    !toolIsAvailable(input, "draft_rtm_table")
  ) {
    return undefined;
  }
  if (input.requireInventoryReview) return undefined;
  if (
    input.reviewPhase === "in_progress" ||
    input.reviewPhase === "ready_to_finish"
  ) {
    return undefined;
  }
  if (
    stepsIncludeTool(input.steps, "draft_rtm_table") ||
    stepsIncludeTool(input.steps, "edit_table")
  ) {
    return undefined;
  }
  if (input.hasReadSectionTool && !stepsIncludeTool(input.steps, "read_section")) {
    return undefined;
  }
  return {
    activeTools: ["draft_rtm_table"],
    toolChoice: { type: "tool", toolName: "draft_rtm_table" },
  };
}

function asTableEditSteps(
  steps: readonly SearchLoopStep[]
): ChatStepWithTools[] {
  return steps.map((step) => ({
    toolCalls: collectToolCalls(step).flatMap((call) => {
      const toolName = callToolName(call);
      if (!toolName) return [];
      return [
        {
          toolCallId: typeof call.toolCallId === "string" ? call.toolCallId : "",
          toolName,
        },
      ];
    }),
    toolResults: collectToolResults(step).flatMap((result) => {
      const toolName = callToolName(result);
      if (!toolName) return [];
      return [
        {
          toolCallId:
            typeof result.toolCallId === "string" ? result.toolCallId : "",
          toolName,
          output: toolPayload(result),
        },
      ];
    }),
  }));
}

function payloadStatus(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const status = (output as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function resultToolName(result: {
  toolName?: unknown;
  tool?: unknown;
}): string {
  return typeof result.toolName === "string"
    ? result.toolName
    : typeof result.tool === "string"
      ? result.tool
      : "";
}

/** True when the latest start_document_review this turn asked for a file set. */
export function lastStartNeedsAttachmentScope(
  steps: readonly SearchLoopStep[]
): boolean {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step) continue;
    for (const result of step.toolResults ?? []) {
      if (resultToolName(result) !== "start_document_review") continue;
      return payloadStatus(result.output ?? result.result) ===
        "needs_attachment_scope";
    }
  }
  return false;
}

/**
 * E2: force `list_attachments` only on the step *after* needs_attachment_scope.
 * A later listing must unlock start_document_review (with attachmentIds).
 * Leaving the force on after that listing locks the turn on list_attachments.
 */
export function shouldForceListAttachments(
  steps: readonly SearchLoopStep[]
): boolean {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step) continue;
    const results = step.toolResults ?? [];
    for (let j = results.length - 1; j >= 0; j--) {
      const result = results[j];
      if (!result) continue;
      const name = resultToolName(result);
      if (name === "list_attachments") return false;
      if (name === "start_document_review") {
        return (
          payloadStatus(result.output ?? result.result) ===
          "needs_attachment_scope"
        );
      }
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
    if (
      input.explicitDocumentEdit &&
      input.preferProposeEdit &&
      !input.explicitSectionRewrite &&
      toolIsAvailable(input, "propose_edit") &&
      !stepsIncludeTool(input.steps, "propose_edit")
    ) {
      return {
        activeTools: ["propose_edit"],
        toolChoice: { type: "tool", toolName: "propose_edit" },
      };
    }
    return { activeTools: [] };
  }
  if (
    tableEditDirective === "review" &&
    input.advertisedTools.includes("start_document_review")
  ) {
    return {
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    };
  }
  if (tableEditDirective === "reread" && input.hasReadSectionTool) {
    return {
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    };
  }

  if (
    rtmDraftLoopDirective(input.steps) === "force" &&
    toolIsAvailable(input, "draft_rtm_table")
  ) {
    return {
      activeTools: ["draft_rtm_table"],
      toolChoice: { type: "tool", toolName: "draft_rtm_table" },
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

  const deliverEdit = explicitDocumentEditStep(input);
  if (deliverEdit) return deliverEdit;

  const rtmWrite = rtmFirstWriteStep(input);
  if (rtmWrite) return rtmWrite;

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
    policy:
      input.alreadyDrafted && !input.requireInventoryReview
        ? "adaptive"
        : input.retrievalPolicy,
    phase: input.reviewPhase,
    availableTools: input.advertisedTools,
    requireInventoryReview: input.requireInventoryReview,
    restartInventoryReview:
      input.restartInventoryReview ?? input.requireInventoryReview,
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
  const unlockWrites =
    input.userIntentKind === "read" &&
    !reviewActive &&
    stepsRequestedHiddenWriteTool(input.steps, DOCUMENT_WRITE_TOOL_SET);
  const maybeUnlock = (tools: readonly string[]): string[] =>
    unlockWrites
      ? withUnlockedWriteTools(tools, input.registeredWriteTools ?? [])
      : [...tools];

  if (!prepared) {
    let activeTools = applyLoopHides(input.advertisedTools);
    if (input.alreadyDrafted) {
      activeTools = withoutDraftFieldTools(activeTools);
    }
    return { activeTools: maybeUnlock(activeTools) };
  }
  let activeTools = input.alreadyDrafted
    ? withoutDraftFieldTools(prepared.activeTools)
    : prepared.activeTools;
  activeTools = applyLoopHides(activeTools);
  return {
    activeTools: maybeUnlock(activeTools),
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
