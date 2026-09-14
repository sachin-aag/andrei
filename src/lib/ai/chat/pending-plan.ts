import type { DocumentType, SectionType } from "@/db/schema";
import { sectionFillState, sectionLabel } from "@/lib/ai/chat/fields";
import { getDocumentType } from "@/lib/document-types";

/** Client-sent user turn that continues a server-owned section queue. */
export const CHAT_AUTO_CONTINUE_TEXT = "Continue the remaining sections.";

export const CHAT_PLAN_ITEM_STATES = [
  "queued",
  "in_progress",
  "done",
  "blocked",
] as const;
export type ChatPlanItemState = (typeof CHAT_PLAN_ITEM_STATES)[number];

export type ChatPlanItem = {
  sectionKey: string;
  label: string;
  state: ChatPlanItemState;
};

export type ChatPendingPlan = {
  kind: "section_queue";
  objective: string;
  items: ChatPlanItem[];
  createdAt: string;
  promptVersion: string;
  paused?: boolean;
  pauseReason?: string;
};

export type ChatTurnContinuation = {
  remaining: number;
  nextLabel: string;
  itemIndex: number;
  total: number;
};

const MULTI_SECTION_DRAFT_RE =
  /\b(?:remaining sections?|all (?:the )?(?:empty )?sections?|every section|entire (?:report|document)|whole (?:report|document)|(?:draft|write|fill(?:\s+(?:in|out))?|populate|complete)\s+(?:the )?(?:report|document|elr)|fill(?:\s+(?:in|out))?\s+(?:the )?(?:rest|remaining))\b/i;

const RESUME_PLAN_RE =
  /\b(?:continue (?:the )?(?:remaining )?sections?|keep going|resume|finish (?:the )?(?:rest|remaining|report|draft))\b/i;

const DOCUMENT_REVIEW_TOOLS = new Set([
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
]);

export function isChatPlanItemState(
  value: unknown
): value is ChatPlanItemState {
  return (
    typeof value === "string" &&
    (CHAT_PLAN_ITEM_STATES as readonly string[]).includes(value)
  );
}

export function parseChatPendingPlan(value: unknown): ChatPendingPlan | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (rec.kind !== "section_queue") return null;
  if (typeof rec.objective !== "string" || !rec.objective.trim()) return null;
  if (typeof rec.createdAt !== "string" || !rec.createdAt) return null;
  if (typeof rec.promptVersion !== "string" || !rec.promptVersion) return null;
  if (!Array.isArray(rec.items) || rec.items.length === 0) return null;
  const items: ChatPlanItem[] = [];
  for (const item of rec.items) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.sectionKey !== "string" || !row.sectionKey.trim()) {
      return null;
    }
    if (typeof row.label !== "string" || !row.label.trim()) return null;
    if (!isChatPlanItemState(row.state)) return null;
    items.push({
      sectionKey: row.sectionKey,
      label: row.label,
      state: row.state,
    });
  }
  return {
    kind: "section_queue",
    objective: rec.objective.trim(),
    items,
    createdAt: rec.createdAt,
    promptVersion: rec.promptVersion,
    ...(rec.paused === true ? { paused: true } : {}),
    ...(typeof rec.pauseReason === "string" && rec.pauseReason.trim()
      ? { pauseReason: rec.pauseReason.trim() }
      : {}),
  };
}

export function parseChatTurnContinuation(
  value: unknown
): ChatTurnContinuation | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.remaining !== "number" ||
    !Number.isInteger(rec.remaining) ||
    rec.remaining < 0
  ) {
    return null;
  }
  if (typeof rec.nextLabel !== "string" || !rec.nextLabel.trim()) return null;
  if (
    typeof rec.itemIndex !== "number" ||
    !Number.isInteger(rec.itemIndex) ||
    rec.itemIndex < 1
  ) {
    return null;
  }
  if (
    typeof rec.total !== "number" ||
    !Number.isInteger(rec.total) ||
    rec.total < 1
  ) {
    return null;
  }
  return {
    remaining: rec.remaining,
    nextLabel: rec.nextLabel.trim(),
    itemIndex: rec.itemIndex,
    total: rec.total,
  };
}

export function continuationFromMetadata(
  metadata: unknown
): ChatTurnContinuation | null {
  if (!metadata || typeof metadata !== "object") return null;
  return parseChatTurnContinuation(
    (metadata as { continuation?: unknown }).continuation
  );
}

export function chatUserTurnIsAutoContinue(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { autoContinue?: unknown }).autoContinue === true;
}

export function isMultiSectionDraftRequest(userText: string): boolean {
  return MULTI_SECTION_DRAFT_RE.test(userText.trim());
}

export function isPlanResumeRequest(userText: string): boolean {
  return RESUME_PLAN_RE.test(userText.trim());
}

export function inventorySectionSet(
  documentType: DocumentType
): ReadonlySet<string> {
  return new Set(getDocumentType(documentType).chat.inventorySections ?? []);
}

export function seedSectionQueuePlan(input: {
  userText: string;
  documentType: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown> | undefined>>;
  promptVersion: string;
  now?: Date;
}): ChatPendingPlan | null {
  const def = getDocumentType(input.documentType);
  const items: ChatPlanItem[] = [];
  for (const section of def.chat.draftOrder) {
    const fill = sectionFillState(input.sections[section], section);
    if (fill !== "empty") continue;
    items.push({
      sectionKey: section,
      label: sectionLabel(section),
      state: "queued",
    });
  }
  if (items.length < 2) return null;
  const first = items[0];
  if (first) first.state = "in_progress";
  return {
    kind: "section_queue",
    objective: input.userText.trim().slice(0, 500),
    items,
    createdAt: (input.now ?? new Date()).toISOString(),
    promptVersion: input.promptVersion,
  };
}

export function resolvePlanAtTurnStart(input: {
  existing: ChatPendingPlan | null;
  userText: string;
  autoContinue: boolean;
  writeIntent: boolean;
  documentType: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown> | undefined>>;
  promptVersion: string;
  now?: Date;
}): ChatPendingPlan | null {
  const existing = input.existing;
  if (input.autoContinue && existing && !existing.paused) {
    return existing;
  }
  if (
    existing &&
    existing.paused &&
    (input.autoContinue || isPlanResumeRequest(input.userText))
  ) {
    return resumeChatPendingPlan(existing);
  }
  if (input.writeIntent && isMultiSectionDraftRequest(input.userText)) {
    return seedSectionQueuePlan({
      userText: input.userText,
      documentType: input.documentType,
      sections: input.sections,
      promptVersion: input.promptVersion,
      now: input.now,
    });
  }
  if (existing && !input.autoContinue && !isPlanResumeRequest(input.userText)) {
    return pauseChatPendingPlan(existing, "new_user_message");
  }
  return existing;
}

export function pauseChatPendingPlan(
  plan: ChatPendingPlan,
  reason: string
): ChatPendingPlan {
  return {
    ...plan,
    paused: true,
    pauseReason: reason.trim() || "paused",
    items: plan.items.map((item) =>
      item.state === "in_progress" ? { ...item, state: "queued" } : item
    ),
  };
}

export function resumeChatPendingPlan(
  plan: ChatPendingPlan
): ChatPendingPlan | null {
  const remaining = plan.items.filter((item) => item.state !== "done");
  if (remaining.length === 0) return null;
  const next = remaining.find((item) => item.state !== "blocked") ?? remaining[0];
  return {
    ...plan,
    paused: false,
    pauseReason: undefined,
    items: plan.items.map((item) =>
      item.sectionKey === next?.sectionKey
        ? { ...item, state: "in_progress" }
        : item.state === "in_progress"
          ? { ...item, state: "queued" }
          : item
    ),
  };
}

export function currentPlanTurnSections(
  plan: ChatPendingPlan,
  documentType: DocumentType
): ChatPlanItem[] {
  const current = plan.items.find((item) => item.state === "in_progress");
  if (!current) return [];
  const inventory = inventorySectionSet(documentType);
  const currentIndex = plan.items.findIndex(
    (item) => item.sectionKey === current.sectionKey
  );
  const next = plan.items[currentIndex + 1];
  if (
    next &&
    next.state === "queued" &&
    !inventory.has(current.sectionKey) &&
    !inventory.has(next.sectionKey)
  ) {
    return [current, next];
  }
  return [current];
}

export function planPromptBlock(
  plan: ChatPendingPlan,
  documentType: DocumentType
): string {
  if (plan.paused) {
    return `## Multi-section plan (paused)
The remaining-section queue is paused${plan.pauseReason ? ` (${plan.pauseReason})` : ""}. Do not start the next section unless the engineer asked to resume.`;
  }
  const turn = currentPlanTurnSections(plan, documentType);
  if (turn.length === 0) return "";
  const done = plan.items.filter((item) => item.state === "done").length;
  const total = plan.items.length;
  const labels = turn
    .map((item) => `**${item.label}** [${item.sectionKey}]`)
    .join(" and ");
  const next = plan.items.find(
    (item) =>
      item.state === "queued" &&
      !turn.some((current) => item.sectionKey === current.sectionKey)
  );
  const nextLine = next
    ? `Do not start ${next.label}. The next request continues automatically.`
    : "This is the last item in the queue.";
  return `## Multi-section plan
The engineer asked to draft several sections (${done} of ${total} done). This turn: ${labels}.
Draft only ${turn.length === 1 ? "this section" : "these two sections"}. ${nextLine}`;
}

function toolNamesFromParts(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];
  const names: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const rec = part as { type?: unknown; toolName?: unknown };
    if (typeof rec.toolName === "string" && rec.toolName) {
      names.push(rec.toolName);
      continue;
    }
    if (typeof rec.type === "string" && rec.type.startsWith("tool-")) {
      names.push(rec.type.slice("tool-".length));
    }
  }
  return names;
}

export function partsUsedDocumentReview(parts: unknown): boolean {
  return toolNamesFromParts(parts).some((name) =>
    DOCUMENT_REVIEW_TOOLS.has(name)
  );
}

export function shouldAutoContinuePlan(
  continuation: ChatTurnContinuation | null | undefined,
  options?: { cancelled?: boolean; busy?: boolean }
): boolean {
  if (options?.cancelled) return false;
  if (options?.busy) return false;
  if (!continuation) return false;
  return continuation.remaining > 0;
}

export function planHasRemainingWork(plan: ChatPendingPlan | null): boolean {
  if (!plan) return false;
  return plan.items.some((item) => item.state !== "done");
}

export function persistablePendingPlan(
  plan: ChatPendingPlan | null
): ChatPendingPlan | null {
  if (!plan || !planHasRemainingWork(plan)) return null;
  return plan;
}

export function planProgressChipLabel(
  continuation: ChatTurnContinuation
): string {
  return `${continuation.itemIndex} of ${continuation.total} — ${continuation.nextLabel}`;
}

export function advancePlanAfterTurn(input: {
  plan: ChatPendingPlan;
  documentType: DocumentType;
  draftedSectionKeys: readonly string[];
  parts?: unknown;
}): {
  plan: ChatPendingPlan;
  continuation: ChatTurnContinuation | null;
  progressed: boolean;
} {
  const drafted = new Set(input.draftedSectionKeys);
  const turn = currentPlanTurnSections(input.plan, input.documentType);
  const turnKeys = new Set(turn.map((item) => item.sectionKey));
  const completedThisTurn = turn.filter((item) => drafted.has(item.sectionKey));
  const reviewed = partsUsedDocumentReview(input.parts);

  if (completedThisTurn.length === 0 && !reviewed) {
    const paused = pauseChatPendingPlan(input.plan, "no_progress");
    return { plan: paused, continuation: null, progressed: false };
  }

  const nextItems = input.plan.items.map((item) => {
    if (drafted.has(item.sectionKey) && turnKeys.has(item.sectionKey)) {
      return { ...item, state: "done" as const };
    }
    return item;
  });

  const stillOpen = nextItems.filter((item) => item.state !== "done");
  if (stillOpen.length === 0) {
    return {
      plan: { ...input.plan, items: nextItems, paused: false, pauseReason: undefined },
      continuation: null,
      progressed: completedThisTurn.length > 0,
    };
  }

  const hasInProgress = nextItems.some((item) => item.state === "in_progress");
  const withCurrent = hasInProgress
    ? nextItems
    : nextItems.map((item) =>
        item.sectionKey === stillOpen[0]?.sectionKey
          ? { ...item, state: "in_progress" as const }
          : item
      );
  const doneCount = withCurrent.filter((item) => item.state === "done").length;
  const nextLabel =
    withCurrent.find((item) => item.state === "in_progress")?.label ??
    stillOpen[0]?.label ??
    "next section";
  return {
    plan: {
      ...input.plan,
      items: withCurrent,
      paused: false,
      pauseReason: undefined,
    },
    continuation: {
      remaining: stillOpen.length,
      nextLabel,
      itemIndex: Math.min(doneCount + 1, withCurrent.length),
      total: withCurrent.length,
    },
    progressed: completedThisTurn.length > 0 || reviewed,
  };
}
