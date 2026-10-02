import {
  chatUserTurnIsAutoContinue,
  continuationFromMetadata,
  planHasRemainingWork,
  type ChatPendingPlan,
} from "@/lib/ai/chat/pending-plan";

export type PlanProgressPlacementMessage = {
  role?: string;
  metadata?: unknown;
};

/**
 * Index in `messages` at which to render the remaining-section task list.
 * A live queue stays under the transcript. After Cancel (or a new typed
 * prompt pauses the queue), the list sits above that later prompt — not
 * below the whole thread.
 */
export function remainingSectionPlanInsertIndex(
  messages: ReadonlyArray<PlanProgressPlacementMessage>,
  plan: ChatPendingPlan | null | undefined
): number {
  const end = messages.length;
  if (!plan || !planHasRemainingWork(plan)) return end;
  if (plan.paused !== true) return end;

  let afterPlan = -1;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      continuationFromMetadata(message.metadata)
    ) {
      afterPlan = i + 1;
    }
  }
  if (afterPlan < 0) {
    let lastAssistant = -1;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]?.role === "assistant") lastAssistant = i;
    }
    if (lastAssistant < 0) return end;
    afterPlan = lastAssistant + 1;
  }

  let insertAt = afterPlan;
  while (insertAt < messages.length) {
    const message = messages[insertAt];
    if (
      message?.role === "user" &&
      chatUserTurnIsAutoContinue(message.metadata)
    ) {
      insertAt += 1;
      continue;
    }
    if (message?.role === "assistant") {
      insertAt += 1;
      continue;
    }
    break;
  }
  return insertAt;
}
