type ToolCallLike = {
  toolCallId: string;
  toolName: string;
};

type ToolResultLike = {
  toolCallId: string;
  toolName: string;
  output?: unknown;
};

export type ChatStepWithTools = {
  toolCalls: readonly ToolCallLike[];
  toolResults: readonly ToolResultLike[];
};

export type TableEditLoopDirective = "continue" | "reread" | "finish" | "review";

function outputStatus(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const status = (output as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function isRecoverableTableEditStatus(status: string | undefined): boolean {
  return status === "review_incomplete" || status === "unsupported_facts";
}

/**
 * Keep a failed structural edit from turning into a long, expensive retry loop.
 * One failed edit gets a forced fresh read; a second failure ends tool use so
 * the model can explain the blocker in plain language.
 * `review_incomplete` is not structural — start the inventory walk instead of
 * dumping the table in chat. `unsupported_facts` stays open for a search retry.
 */
export function tableEditLoopDirective(
  steps: readonly ChatStepWithTools[]
): TableEditLoopDirective {
  let failureCount = 0;
  let latestFailureStep = -1;
  let latestSuccessfulEditStep = -1;
  let latestReadStep = -1;
  let latestReviewIncompleteStep = -1;
  let latestStartReviewStep = -1;

  steps.forEach((step, stepIndex) => {
    const resultByCallId = new Map(
      step.toolResults.map((result) => [result.toolCallId, result])
    );

    for (const call of step.toolCalls) {
      if (call.toolName === "read_section") {
        latestReadStep = stepIndex;
        continue;
      }
      if (call.toolName === "start_document_review") {
        latestStartReviewStep = stepIndex;
        continue;
      }
      if (call.toolName !== "edit_table" && call.toolName !== "draft_rtm_table") {
        continue;
      }

      const result = resultByCallId.get(call.toolCallId);
      const status = outputStatus(result?.output);
      if (status === "proposed") {
        latestSuccessfulEditStep = stepIndex;
        continue;
      }
      if (status === "review_incomplete") {
        latestReviewIncompleteStep = stepIndex;
        continue;
      }
      if (isRecoverableTableEditStatus(status)) {
        continue;
      }
      failureCount += 1;
      latestFailureStep = stepIndex;
    }
  });

  if (
    latestSuccessfulEditStep > latestFailureStep &&
    latestSuccessfulEditStep > latestReviewIncompleteStep
  ) {
    return "continue";
  }
  if (
    latestReviewIncompleteStep > latestSuccessfulEditStep &&
    latestReviewIncompleteStep > latestStartReviewStep
  ) {
    return "review";
  }
  if (failureCount >= 2) return "finish";
  if (failureCount === 1 && latestReadStep < latestFailureStep) return "reread";
  return "continue";
}
