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

export type TableEditLoopDirective = "continue" | "reread" | "finish";

function outputStatus(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const status = (output as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

/**
 * Keep a failed structural edit from turning into a long, expensive retry loop.
 * One failed edit gets a forced fresh read; a second failure ends tool use so
 * the model can explain the blocker in plain language.
 */
export function tableEditLoopDirective(
  steps: readonly ChatStepWithTools[]
): TableEditLoopDirective {
  let failureCount = 0;
  let latestFailureStep = -1;
  let latestSuccessfulEditStep = -1;
  let latestReadStep = -1;

  steps.forEach((step, stepIndex) => {
    const resultByCallId = new Map(
      step.toolResults.map((result) => [result.toolCallId, result])
    );

    for (const call of step.toolCalls) {
      if (call.toolName === "read_section") {
        latestReadStep = stepIndex;
        continue;
      }
      if (call.toolName !== "edit_table") continue;

      const result = resultByCallId.get(call.toolCallId);
      if (outputStatus(result?.output) === "proposed") {
        latestSuccessfulEditStep = stepIndex;
        continue;
      }
      failureCount += 1;
      latestFailureStep = stepIndex;
    }
  });

  if (latestSuccessfulEditStep > latestFailureStep) return "continue";
  if (failureCount >= 2) return "finish";
  if (failureCount === 1 && latestReadStep < latestFailureStep) return "reread";
  return "continue";
}
