import type { DocumentType, SectionType } from "@/db/schema";
import {
  isChatEditableSection,
  isEmptyTableScaffoldDoc,
  sectionFillState,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import { coverageKeySatisfiesObjective, REVIEW_OBJECTIVE_PAGE_FLOOR } from "@/lib/ai/chat/review-page-plan";
import {
  inventorySectionForObjective,
  preferredInventoryEvidenceSkipped,
} from "@/lib/ai/chat/inventory-review-schema";
import { getDocumentType } from "@/lib/document-types";
import {
  elrIncompleteSectionKeysFromParts,
  planEditToolLanded,
} from "@/lib/document-types/elr/plan-complete";
import {
  CHAT_IDENTITY_SECTION,
  chatIdentityLabel,
  identityNeedsDraft,
  isChatIdentitySection,
  type ChatIdentityReport,
} from "@/lib/ai/chat/identity";
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
  /**
   * Remaining-section POSTs that ended without completing this item.
   * Pauses the queue at `CHAT_PLAN_SAME_SECTION_TURN_LIMIT`.
   */
  attempts?: number;
};

/**
 * Max Agent remaining-section turns on one in-progress item without
 * completing it. Review-only 270s aborts count — they must not chain
 * forever on the same ELR evidence section.
 */
export const CHAT_PLAN_SAME_SECTION_TURN_LIMIT = 3;

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
 * (`draft the report`, `remaining sections`). "Go on to X and sections after
 * that" is the same ask — without this the turn is a write with no queue and
 * the model mills every leftover inventory until the 270s abort.
 */
const MULTI_SECTION_DRAFT_RE =
  /\b(?:remaining (?:sections?|report|document|elr)|all (?:the )?(?:empty )?sections?|every section|entire (?:report|document)|whole (?:report|document)|(?:draft|write|fill(?:\s+(?:in|out))?|populate|complete)\s+(?:the )?(?:remaining |rest of (?:the )?)?(?:report|document|elr)|fill(?:\s+(?:in|out))?\s+(?:the )?(?:rest|remaining)|sections? after (?:that|this)|(?:the )?(?:rest|remaining) after (?:that|this)|and (?:then )?(?:the )?(?:rest|remaining sections?))\b/i;

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
    const parsed: ChatPlanItem = {
      sectionKey: row.sectionKey,
      label: row.label,
      state: row.state,
    };
    if (
      typeof row.attempts === "number" &&
      Number.isInteger(row.attempts) &&
      row.attempts > 0
    ) {
      parsed.attempts = row.attempts;
    }
    items.push(parsed);
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

export function inventoryFinishSatisfiesEmptyTable(input: {
  reviewedPages: number;
  skippedAttachmentIds: readonly string[];
  objective?: string | null;
  queuedFilenames?: readonly string[];
  skippedFilenames?: readonly string[];
}): boolean {
  if (
    input.reviewedPages <= REVIEW_OBJECTIVE_PAGE_FLOOR &&
    input.skippedAttachmentIds.length > 0
  ) {
    return false;
  }
  const section = inventorySectionForObjective(input.objective);
  if (
    section &&
    preferredInventoryEvidenceSkipped(
      section,
      input.queuedFilenames ?? [],
      input.skippedFilenames ?? []
    )
  ) {
    return false;
  }
  return true;
}

export function emptyInventoryNeedsMatchingReview(input: {
  documentType: DocumentType;
  section: SectionType;
  content: Record<string, unknown> | undefined;
  finishedCoverageKey: string | null | undefined;
  /**
   * Floor-8 + skipped-document finishes still emit a matching `|obj:` key.
   * Pass false so edit_table stays locked until a real walk (PRQR queued).
   * Omit to treat a matching key as enough (tests / rehydrated non-truncated).
   */
  inventoryFinishSatisfiesDraft?: boolean;
}): boolean {
  if (!isEmptyInventoryTable(input.documentType, input.section, input.content)) {
    return false;
  }
  if (!coverageKeySatisfiesObjective(input.finishedCoverageKey, input.section)) {
    return true;
  }
  return input.inventoryFinishSatisfiesDraft === false;
}

export function inScopeEmptyInventoryNeedsReview(input: {
  documentType: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown> | undefined>>;
  sectionKeys: readonly SectionType[];
  finishedCoverageKey: string | null | undefined;
  inventoryFinishSatisfiesDraft?: boolean;
}): boolean {
  return input.sectionKeys.some((section) =>
    emptyInventoryNeedsMatchingReview({
      documentType: input.documentType,
      section,
      content: input.sections[section],
      finishedCoverageKey: input.finishedCoverageKey,
      inventoryFinishSatisfiesDraft: input.inventoryFinishSatisfiesDraft,
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
  report?: ChatIdentityReport | null;
}): ChatPendingPlan | null {
  const def = getDocumentType(input.documentType);
  const items: ChatPlanItem[] = [];
  if (identityNeedsDraft(input.documentType, input.report)) {
    items.push({
      sectionKey: CHAT_IDENTITY_SECTION,
      label: chatIdentityLabel(input.documentType),
      state: "queued",
    });
  }
  for (const section of def.chat.draftOrder) {
    const fill = sectionFillState(input.sections[section], section);
    if (fill !== "empty") continue;
    items.push({
      sectionKey: section,
      label: sectionLabel(section),
      state: "queued",
    });
  }
  if (items.length === 0) return null;
  const identityOnly =
    items.length === 1 && isChatIdentitySection(items[0]!.sectionKey);
  if (items.length < 2 && !identityOnly) return null;
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
  report?: ChatIdentityReport | null;
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
      report: input.report,
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
    items: plan.items.map((item) => {
      if (item.sectionKey !== next?.sectionKey) {
        return item.state === "in_progress"
          ? { ...item, state: "queued" as const }
          : item;
      }
      const { attempts: _attempts, ...rest } = item;
      return { ...rest, state: "in_progress" as const };
    }),
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
  const elrSiblingLine =
    documentType === "equipment_lifecycle_report"
      ? " Evidence tables are not done after edit_table alone — draft narrative in the same turn with a count from the rows (and trend for breakdowns/alarms). Access Control is not done until every annexure Sr. row is copied, including the continuation page of a Page N of M split. Risk overallGrade is low|medium|high (max of row priority and downtime/scrap floor). Conclusion recommendation is continue|early_requalification|capa|other."
      : "";
  const identityLine = turn.some((item) =>
    isChatIdentitySection(item.sectionKey)
  )
    ? " Cover/header identity is not a TipTap section — call draft_identity with the scalar fields (equipment name, document number, …). Search attachments first. That write lands immediately (not a suggestion card). ask_user only when a fact is still missing after search, or a fork (both Vial and Cartridge on an ELR)."
    : "";
  return `## Multi-section plan
The engineer asked to draft several sections (${done} of ${total} done). This turn: ${labels}.
Draft only ${turn.length === 1 ? "this section" : "these two sections"}. ${nextLine}${identityLine}${elrSiblingLine}`;
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

/** Section this turn actually drafted, or the in-progress item when live is unknown. */
export function completedPlanSectionLabel(
  plan: ChatPendingPlan | null | undefined,
  live?: LivePlanProgress | null
): string | null {
  if (!plan) return null;
  const drafted = live?.draftedSectionKeys ?? [];
  const labels: string[] = [];
  for (const key of drafted) {
    const label = plan.items.find((item) => item.sectionKey === key)?.label;
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length > 0) return labels.join(", ");
  if (live) return null;
  return (
    plan.items.find((item) => item.state === "in_progress")?.label ?? null
  );
}

const PLAN_EDIT_TOOLS = new Set([
  "draft_field",
  "edit_table",
  "propose_edit",
  "draft_identity",
]);

function identityPlanLanded(part: {
  output?: unknown;
  result?: unknown;
}): boolean {
  if (!planEditToolLanded(part)) return false;
  const raw = part.output ?? part.result;
  if (!raw || typeof raw !== "object") return false;
  return (raw as { complete?: unknown }).complete === true;
}

export type LivePlanProgress = {
  draftedSectionKeys: string[];
  inFlightSectionKey: string | null;
  /** ELR evidence/risk/conclusion keys edited this turn but still missing siblings. */
  incompleteSectionKeys?: string[];
};

/** Sections the current assistant turn has drafted or is writing. */
export function livePlanProgressFromParts(parts: unknown): LivePlanProgress {
  const draftedSectionKeys: string[] = [];
  let inFlightSectionKey: string | null = null;
  if (!Array.isArray(parts)) {
    return {
      draftedSectionKeys,
      inFlightSectionKey,
      incompleteSectionKeys: [],
    };
  }
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const rec = part as {
      type?: unknown;
      toolName?: unknown;
      state?: unknown;
      input?: unknown;
      output?: unknown;
      result?: unknown;
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
    if (name === "draft_identity") {
      const identityKey = CHAT_IDENTITY_SECTION;
      const state = typeof rec.state === "string" ? rec.state : "";
      if (state === "output-available") {
        if (
          identityPlanLanded(rec) &&
          !draftedSectionKeys.includes(identityKey)
        ) {
          draftedSectionKeys.push(identityKey);
        }
        if (inFlightSectionKey === identityKey) inFlightSectionKey = null;
        continue;
      }
      if (state === "output-error") continue;
      inFlightSectionKey = identityKey;
      continue;
    }
    const sectionFromInput = (input as { section?: unknown }).section;
    const key =
      typeof sectionFromInput === "string" ? sectionFromInput.trim() : "";
    if (!key) continue;
    const state = typeof rec.state === "string" ? rec.state : "";
    if (state === "output-available") {
      if (
        planEditToolLanded(rec) &&
        !draftedSectionKeys.includes(key)
      ) {
        draftedSectionKeys.push(key);
      }
      if (inFlightSectionKey === key) inFlightSectionKey = null;
      continue;
    }
    if (state === "output-error") continue;
    inFlightSectionKey = key;
  }
  return {
    draftedSectionKeys,
    inFlightSectionKey,
    incompleteSectionKeys: elrIncompleteSectionKeysFromParts(parts),
  };
}

/**
 * Remaining-section drafts across the thread, not only the last assistant
 * row. A wrap-up message after the last `edit_table` must not wipe earlier
 * drafted keys (that left the N of N chip spinning after the queue finished).
 */
export function livePlanProgressFromMessages(
  messages: ReadonlyArray<{ role?: string; parts?: unknown }>
): LivePlanProgress | null {
  const draftedSectionKeys: string[] = [];
  const incomplete = new Set<string>();
  let inFlightSectionKey: string | null = null;
  let found = false;
  for (const message of messages) {
    if (message?.role !== "assistant") continue;
    const live = livePlanProgressFromParts(message.parts);
    if (
      live.draftedSectionKeys.length === 0 &&
      live.inFlightSectionKey == null
    ) {
      continue;
    }
    found = true;
    const stillIncomplete = new Set(live.incompleteSectionKeys);
    for (const key of live.draftedSectionKeys) {
      if (!draftedSectionKeys.includes(key)) draftedSectionKeys.push(key);
      if (stillIncomplete.has(key)) incomplete.add(key);
      else incomplete.delete(key);
    }
    inFlightSectionKey = live.inFlightSectionKey;
  }
  if (!found) return null;
  return {
    draftedSectionKeys,
    inFlightSectionKey,
    incompleteSectionKeys: draftedSectionKeys.filter((key) => incomplete.has(key)),
  };
}

export type ChatPlanProgressView = {
  itemIndex: number;
  total: number;
  currentLabel: string;
  chipLabel: string;
  paused: boolean;
  complete: boolean;
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
  const incomplete = new Set(live?.incompleteSectionKeys ?? []);
  const inFlight = live?.inFlightSectionKey?.trim() || null;
  const turnKeys = new Set(
    currentPlanTurnSections(plan, documentType).map((item) => item.sectionKey)
  );
  const done: ChatPlanItem[] = [];
  const current: ChatPlanItem[] = [];
  const pending: ChatPlanItem[] = [];
  for (const item of plan.items) {
    const liveDone =
      drafted.has(item.sectionKey) && !incomplete.has(item.sectionKey);
    if (item.state === "done" || liveDone) {
      done.push(item);
      continue;
    }
    if (plan.paused === true) {
      pending.push(item);
      continue;
    }
    const running =
      inFlight === item.sectionKey ||
      item.state === "in_progress" ||
      turnKeys.has(item.sectionKey) ||
      incomplete.has(item.sectionKey);
    if (running) {
      current.push(item);
      continue;
    }
    pending.push(item);
  }
  const total = plan.items.length;
  const complete = total > 0 && done.length === total;
  const incompleteFocus = current.find((item) => incomplete.has(item.sectionKey));
  const focus =
    incompleteFocus ??
    (inFlight
      ? current.find((item) => item.sectionKey === inFlight) ?? current[0]
      : current[0]) ??
    pending[0];
  const itemIndex = focus
    ? plan.items.findIndex((item) => item.sectionKey === focus.sectionKey) + 1
    : Math.min(done.length + 1, Math.max(total, 1));
  const currentLabel = complete
    ? "done"
    : (focus?.label ?? "next section");
  return {
    itemIndex: complete ? total : itemIndex,
    total,
    currentLabel,
    chipLabel: `${complete ? total : itemIndex} of ${total} — ${currentLabel}`,
    paused: plan.paused === true,
    complete,
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
  const incomplete =
    input.documentType === "equipment_lifecycle_report"
      ? new Set(elrIncompleteSectionKeysFromParts(input.parts))
      : new Set<string>();
  const turn = currentPlanTurnSections(input.plan, input.documentType);
  const turnKeys = new Set(turn.map((item) => item.sectionKey));
  const completedThisTurn = turn.filter(
    (item) => drafted.has(item.sectionKey) && !incomplete.has(item.sectionKey)
  );
  const progressedThisTurn = turn.some((item) => drafted.has(item.sectionKey));
  const reviewed = partsUsedDocumentReview(input.parts);

  if (!progressedThisTurn && !reviewed) {
    const paused = pauseChatPendingPlan(input.plan, "no_progress");
    return { plan: paused, continuation: null, progressed: false };
  }

  const nextItems = input.plan.items.map((item) => {
    if (
      drafted.has(item.sectionKey) &&
      turnKeys.has(item.sectionKey) &&
      !incomplete.has(item.sectionKey)
    ) {
      const { attempts: _attempts, ...rest } = item;
      return { ...rest, state: "done" as const };
    }
    if (turnKeys.has(item.sectionKey)) {
      return { ...item, attempts: (item.attempts ?? 0) + 1 };
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

  const stuck = turn.some((item) => {
    const next = nextItems.find((row) => row.sectionKey === item.sectionKey);
    return (
      next != null &&
      next.state !== "done" &&
      (next.attempts ?? 0) >= CHAT_PLAN_SAME_SECTION_TURN_LIMIT
    );
  });
  if (stuck) {
    return {
      plan: pauseChatPendingPlan(
        { ...input.plan, items: nextItems },
        "same_section_limit"
      ),
      continuation: null,
      progressed: progressedThisTurn || reviewed,
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
    progressed: progressedThisTurn || reviewed,
  };
}
