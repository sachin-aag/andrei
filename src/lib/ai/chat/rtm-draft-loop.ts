import type { SearchLoopStep } from "@/lib/ai/chat/search-loop";
import { callToolName } from "@/lib/ai/chat/search-loop";

export const RTM_DRAFT_MISSING_CONTINUATION_CAP = 2;

export type RtmDraftLoopDirective = "force" | "continue";

function payloadRecord(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  return output as Record<string, unknown>;
}

function missingUrsIdsFromOutput(output: unknown): string[] {
  const record = payloadRecord(output);
  const ids = record?.missingUrsIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && id.trim() !== "");
}

/**
 * Do not wrap up while reviewed URS IDs are still missing after draft_rtm_table.
 * Cap at two continuations so an unreadable page cannot loop the turn.
 */
export function rtmDraftLoopDirective(
  steps: readonly SearchLoopStep[]
): RtmDraftLoopDirective {
  let draftCount = 0;
  let latestMissing: string[] = [];
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (callToolName(result) !== "draft_rtm_table") continue;
      const output = result.output ?? result.result;
      draftCount += 1;
      latestMissing = missingUrsIdsFromOutput(output);
    }
  }
  if (latestMissing.length === 0) return "continue";
  if (draftCount > RTM_DRAFT_MISSING_CONTINUATION_CAP) return "continue";
  return "force";
}
