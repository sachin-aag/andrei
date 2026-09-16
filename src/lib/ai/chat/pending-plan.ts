import type { DocumentType, SectionType } from "@/db/schema";
import {
  isChatEditableSection,
  isEmptyTableScaffoldDoc,
  sectionFillState,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import { coverageKeySatisfiesObjective } from "@/lib/ai/chat/review-page-plan";
import { getDocumentType } from "@/lib/document-types";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";

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

/**
 * Whole-document / remaining-section asks. `remaining` may sit between the
 * verb and the noun (`draft remaining report`), not only after it
 * (`draft the report`, `remaining sections`).
 */
const MULTI_SECTION_DRAFT_RE =
  /\b(?:remaining (?:sections?|report|document|elr)|all (?:the )?(?:empty )?sections?|every section|entire (?:report|document)|whole (?:report|document)|(?:draft|write|fill(?:\s+(?:in|out))?|populate|complete)\s+(?:the )?(?:remaining |rest of (?:the )?)?(?:report|document|elr)|fill(?:\s+(?:in|out))?\s+(?:the )?(?:rest|remaining))\b/i;

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

export function isInventoryTableField(
  documentType: DocumentType,
  section: string,
  targetField: string
): boolean {
  return inventorySectionSet(documentType).has(section) && targetField === "table";
}

/** Seeded ELR matrices — never rewrite with draft_field. DV Results still uses it. */
export function isElrInventoryTableField(
  documentType: DocumentType,
  section: string,
  targetField: string
): boolean {
  return (
    documentType === "equipment_lifecycle_report" &&
    isInventoryTableField(documentType, section, targetField)
  );
}

export function isEmptyInventoryTable(
  documentType: DocumentType,
  section: SectionType,
  content: Record<string, unknown> | undefined
): boolean {
  if (!inventorySectionSet(documentType).has(section)) return false;
  return isEmptyTableScaffoldDoc(getRichFieldValue(content ?? {}, "table"));
}

export function emptyInventoryNeedsMatchingReview(input: {
  documentType: DocumentType;
  section: SectionType;
  content: Record<string, unknown> | undefined;
  finishedCoverageKey: string | null | undefined;
}): boolean {
  if (!isEmptyInventoryTable(input.documentType, input.section, input.content)) {
    return false;
  }
  return !coverageKeySatisfiesObjective(input.finishedCoverageKey, input.section);
}

export function inScopeEmptyInventoryNeedsReview(input: {
  documentType: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown> | undefined>>;
  sectionKeys: readonly SectionType[];
  finishedCoverageKey: string | null | undefined;
}): boolean {
  return input.sectionKeys.some((section) =>
    emptyInventoryNeedsMatchingReview({
      documentType: input.documentType,
      section,
      content: input.sections[section],
      finishedCoverageKey: input.finishedCoverageKey,
    })
  );
}

export function planKeepsComprehensive(
  plan: ChatPendingPlan | null,
  documentType: DocumentType
): boolean {
  if (!plan || plan.paused) return false;
  const current = plan.items.find((item) => item.state === "in_progress");
  if (!current) return false;
  return inventorySectionSet(documentType).has(current.sectionKey);
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

export function planCoverageObjective(
  plan: ChatPendingPlan | null,
  userText: string,
  options?: {
    sectionScope?: string | null;
    documentType?: DocumentType;
  }
): string {
  const documentType = options?.documentType ?? "investigation_report";
  const scope = options?.sectionScope?.trim() ?? "";
  if (scope && scope !== "all" && isChatEditableSection(scope, documentType)) {
    return scope;
  }
  const detected = detectSectionIntentFromText(userText, documentType);
  if (detected) return detected;
  if (plan && !plan.paused) {
    const current = plan.items.find((item) => item.state === "in_progress");
    if (current?.sectionKey) return current.sectionKey;
  }
  return userText.trim().slice(0, 80);
}

/**
 * Stamp coverage from the section being drafted this turn, not a leftover
 * plan pointer. `@` scope, then the latest user message, then a section-key
 * tool objective, then the route/plan key.
 */
export function resolveReviewCoverageObjective(input: {
  routeObjective?: string | null;
  toolObjective: string;
  documentType: DocumentType;
  userText?: string;
  sectionScope?: string | null;
}): string {
  const scope = input.sectionScope?.trim() ?? "";
  if (
    scope &&
    scope !== "all" &&
    isChatEditableSection(scope, input.documentType)
  ) {
    return scope;
  }
  const fromUser = input.userText
    ? detectSectionIntentFromText(input.userText, input.documentType)
    : null;
  if (fromUser) return fromUser;
  const tool = input.toolObjective.trim();
  if (tool && isChatEditableSection(tool, input.documentType)) {
    return tool;
  }
  const route = input.routeObjective?.trim() ?? "";
  if (route && isChatEditableSection(route, input.documentType)) {
    return route;
  }
  return tool || route;
}

export function planProgressChipLabel(
  continuation: ChatTurnContinuation
): string {
  return `${continuation.itemIndex} of ${continuation.total} — ${continuation.nextLabel}`;
}

const PLAN_EDIT_TOOLS = new Set([
  "draft_field",
  "edit_table",
  "propose_edit",
]);

export type LivePlanProgress = {
  draftedSectionKeys: string[];
  inFlightSectionKey: string | null;
};

/** Sections the current assistant turn has drafted or is writing. */
export function livePlanProgressFromParts(parts: unknown): LivePlanProgress {
  const draftedSectionKeys: string[] = [];
  let inFlightSectionKey: string | null = null;
  if (!Array.isArray(parts)) {
    return { draftedSectionKeys, inFlightSectionKey };
  }
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const rec = part as {
      type?: unknown;
      toolName?: unknown;
      state?: unknown;
      input?: unknown;
    };
    let name = "";
    if (typeof rec.toolName === "string" && rec.toolName) {
      name = rec.toolName;
    } else if (typeof rec.type === "string" && rec.type.startsWith("tool-")) {
      name = rec.type.slice("tool-".length);
    }
    if (!PLAN_EDIT_TOOLS.has(name)) continue;
    const input = rec.input;
    if (!input || typeof input !== "object") continue;
    const section = (input as { section?: unknown }).section;
    if (typeof section !== "string" || !section.trim()) continue;
    const key = section.trim();
    const state = typeof rec.state === "string" ? rec.state : "";
    if (state === "output-available") {
      if (!draftedSectionKeys.includes(key)) draftedSectionKeys.push(key);
      if (inFlightSectionKey === key) inFlightSectionKey = null;
      continue;
    }
    if (state === "output-error") continue;
    inFlightSectionKey = key;
  }
  return { draftedSectionKeys, inFlightSectionKey };
}

export type ChatPlanProgressView = {
  itemIndex: number;
  total: number;
  currentLabel: string;
  chipLabel: string;
  paused: boolean;
  done: ChatPlanItem[];
  current: ChatPlanItem[];
  pending: ChatPlanItem[];
};

/**
 * Live remaining-section progress. `pendingPlan` is the source of truth;
 * optional live tool parts let the chip move during the current turn.
 */
export function chatPlanProgressView(
  plan: ChatPendingPlan,
  documentType: DocumentType,
  live?: LivePlanProgress | null
): ChatPlanProgressView {
  const drafted = new Set(live?.draftedSectionKeys ?? []);
  const inFlight = live?.inFlightSectionKey?.trim() || null;
  const turnKeys = new Set(
    currentPlanTurnSections(plan, documentType).map((item) => item.sectionKey)
  );
  const done: ChatPlanItem[] = [];
  const current: ChatPlanItem[] = [];
  const pending: ChatPlanItem[] = [];
  for (const item of plan.items) {
    if (item.state === "done" || drafted.has(item.sectionKey)) {
      done.push(item);
      continue;
    }
    const running =
      inFlight === item.sectionKey ||
      item.state === "in_progress" ||
      turnKeys.has(item.sectionKey);
    if (running) {
      current.push(item);
      continue;
    }
    pending.push(item);
  }
  const total = plan.items.length;
  const focus =
    (inFlight
      ? current.find((item) => item.sectionKey === inFlight) ?? current[0]
      : current[0]) ?? pending[0];
  const itemIndex = focus
    ? plan.items.findIndex((item) => item.sectionKey === focus.sectionKey) + 1
    : Math.min(done.length + 1, Math.max(total, 1));
  const currentLabel = focus?.label ?? "next section";
  return {
    itemIndex,
    total,
    currentLabel,
    chipLabel: `${itemIndex} of ${total} — ${currentLabel}`,
    paused: plan.paused === true,
    done,
    current,
    pending,
  };
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
