import type { DocumentType, SectionType } from "@/db/schema";
import {
  isChatEditableSection,
  sectionFillState,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import type { ChatPendingPlan, ChatPlanItem } from "@/lib/ai/chat/pending-plan";
import {
  callToolName,
  collectToolCalls,
  type SearchLoopHideKind,
  type SearchLoopStep,
  type ToolCallLike,
  type ToolResultLike,
  unwrapToolPayload,
} from "@/lib/ai/chat/search-loop";
import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";
import {
  MAKE_PLAN_ATTEMPT_LIMIT,
  MAKE_PLAN_SUCCESS_LIMIT,
  MAKE_PLAN_TOOL,
  parseMakePlanInput,
  validateMakePlan,
  type MakePlanInput,
  type MakePlanRejectReason,
} from "@/lib/ai/chat/task-plan";
import { planEditToolLanded } from "@/lib/document-types/elr/plan-complete";
import { getDocumentType } from "@/lib/document-types";

/**
 * In-turn remaining-work ledger. Kickoff intent stays frozen. prepareStep
 * adds/drops against this from tool results. The orchestrator may call
 * `update_plan` at most once — it is not a todo list it rewrites every step.
 *
 * Completions are mechanical (a draft landed). Ambiguous skip/add goes to
 * `ask_user`, not another plan mutation. Lookups are seeded at kickoff
 * (`alsoLookup`); they are not grown from retrieval hits.
 */
export const UPDATE_PLAN_TOOL = "update_plan";

export const UPDATE_PLAN_ACTIONS = ["skip", "add_section"] as const;
export type UpdatePlanActionName = (typeof UPDATE_PLAN_ACTIONS)[number];

/** One successful revision per turn. A second call is hidden. */
export const UPDATE_PLAN_SUCCESS_LIMIT = 1;
/** Rejected retries burn the slot too, so a typo cannot loop. */
export const UPDATE_PLAN_ATTEMPT_LIMIT = 2;

const REMAINING_WORK_ITEM_KINDS = ["section", "lookup"] as const;
export type RemainingWorkItemKind =
  (typeof REMAINING_WORK_ITEM_KINDS)[number];

const REMAINING_WORK_ITEM_STATES = [
  "queued",
  "in_progress",
  "done",
  "skipped",
] as const;
export type RemainingWorkItemState =
  (typeof REMAINING_WORK_ITEM_STATES)[number];

const REMAINING_WORK_ITEM_SOURCES = [
  "pending_plan",
  "also_lookup",
  "update_plan",
  "make_plan",
] as const;
export type RemainingWorkItemSource =
  (typeof REMAINING_WORK_ITEM_SOURCES)[number];

export type RemainingWorkItem = {
  id: string;
  kind: RemainingWorkItemKind;
  key: string;
  label: string;
  state: RemainingWorkItemState;
  source: RemainingWorkItemSource;
};

export type LivingTurnWork = {
  intent: ChatUserIntentKind;
  alsoLookup: boolean;
  /** Write tools have not landed yet. Mixed follow-up search stays available. */
  writeOutstanding: boolean;
  items: RemainingWorkItem[];
  /** Section queue make_plan wrote this turn; the route persists it at finish. */
  createdPlan?: ChatPendingPlan;
};

export type RemainingWorkSurface = "document" | "analytics";

export type RemainingWorkContext = {
  surface: RemainingWorkSurface;
  documentType?: DocumentType;
  emptySectionKeys: readonly string[];
  queueLive: boolean;
  writeToolNames: ReadonlySet<string>;
  /** Agent write turn with a multi-part ask and no live plan (`makePlanEligible`). */
  makePlanEligible?: boolean;
  promptVersion?: string;
};

export type UpdatePlanAction = {
  action: UpdatePlanActionName;
  sectionKey: string;
  reason: string;
};

export type UpdatePlanRejectReason =
  | "social"
  | "queue_inactive"
  | "unknown_action"
  | "missing_section"
  | "skip_not_queued"
  | "skip_in_progress"
  | "add_already_present"
  | "add_not_empty"
  | "add_not_allowed"
  | "analytics_forbidden";

export type UpdatePlanResult =
  | {
      status: "updated";
      work: LivingTurnWork;
      action: UpdatePlanActionName;
      item: RemainingWorkItem;
    }
  | {
      status: "rejected";
      reason: UpdatePlanRejectReason;
      message: string;
    };

export type RemainingWorkEvent = {
  toolName: string;
  input?: unknown;
  output?: unknown;
  result?: unknown;
  state?: string;
};

const ALSO_LOOKUP_ID = "lookup:also";

const DOCUMENT_WRITE_PROGRESS_TOOLS = new Set([
  "draft_field",
  "edit_table",
  "propose_edit",
]);

const ANALYTICS_WRITE_PROGRESS_TOOLS = new Set([
  "write_column",
  "extract_sheet",
  "load_table",
  "run_capability_sixpack",
  "run_one_way_anova",
  "plot_xy_scatter",
  "plot_boxplot",
  "plot_histogram",
  "plot_time_series",
  "plot_measurements",
]);

const WRITE_FAIL_STATUSES = new Set([
  "error",
  "not_found",
  "not_editable",
  "unavailable",
  "unsupported_facts",
  "overclaim",
  "review_incomplete",
  "use_edit_table",
  "rejected",
]);

export function documentWriteProgressTools(): ReadonlySet<string> {
  return DOCUMENT_WRITE_PROGRESS_TOOLS;
}

export function analyticsWriteProgressTools(): ReadonlySet<string> {
  return ANALYTICS_WRITE_PROGRESS_TOOLS;
}

export function cloneLivingTurnWork(work: LivingTurnWork): LivingTurnWork {
  return {
    intent: work.intent,
    alsoLookup: work.alsoLookup,
    writeOutstanding: work.writeOutstanding,
    items: work.items.map((item) => ({ ...item })),
    ...(work.createdPlan ? { createdPlan: work.createdPlan } : {}),
  };
}

export function emptyDraftOrderKeys(
  documentType: DocumentType,
  sections: Partial<Record<SectionType, Record<string, unknown> | undefined>>
): string[] {
  const keys: string[] = [];
  for (const section of getDocumentType(documentType).chat.draftOrder) {
    if (sectionFillState(sections[section], section) !== "empty") continue;
    keys.push(section);
  }
  return keys;
}

export function seedLivingTurnWork(input: {
  intent: ChatUserIntentKind;
  alsoLookup: boolean;
  pendingPlan?: ChatPendingPlan | null;
}): LivingTurnWork {
  const items: RemainingWorkItem[] = [];
  const plan = input.pendingPlan;
  if (input.intent !== "social" && plan && !plan.paused) {
    for (const item of plan.items) {
      if (item.state === "done" || item.state === "skipped") continue;
      items.push({
        id: `section:${item.sectionKey}`,
        kind: "section",
        key: item.sectionKey,
        label: item.label,
        state: item.state === "in_progress" ? "in_progress" : "queued",
        source: "pending_plan",
      });
    }
  }
  if (input.intent === "write" && input.alsoLookup) {
    items.push({
      id: ALSO_LOOKUP_ID,
      kind: "lookup",
      key: "also_lookup",
      label: "Follow-up question from this turn",
      state: "queued",
      source: "also_lookup",
    });
  }
  return {
    intent: input.intent,
    alsoLookup: input.alsoLookup === true,
    writeOutstanding: input.intent === "write",
    items,
  };
}

function livingWorkHasOpenLookups(work: LivingTurnWork): boolean {
  return work.items.some(
    (item) =>
      item.kind === "lookup" &&
      item.state !== "done" &&
      item.state !== "skipped"
  );
}

/**
 * Keep search after a cited hit / locate only while the write is still due.
 * Two empty greps still hide — that bound is what stops grep loops.
 */
export function livingWorkKeepsSearchOpen(
  work: LivingTurnWork,
  hideKind: SearchLoopHideKind
): boolean {
  if (work.intent === "social") return false;
  if (!livingWorkHasOpenLookups(work)) return false;
  if (!work.writeOutstanding) return false;
  return hideKind === "cited_or_locate";
}

export function remainingWorkPromptBlock(
  work: LivingTurnWork,
  options?: { queueLive?: boolean; surface?: RemainingWorkSurface }
): string {
  if (work.intent === "social") return "";
  const open = work.items.filter(
    (item) => item.state !== "done" && item.state !== "skipped"
  );
  if (open.length === 0 && !work.alsoLookup) return "";
  const lines = open.map((item) => {
    const tag = item.kind === "section" ? `[${item.key}]` : "";
    return `- ${item.kind}: ${item.label}${tag ? ` ${tag}` : ""} (${item.state})`;
  });
  const lookupLine = work.alsoLookup
    ? " A follow-up lookup is still due — search after or while drafting; do not drop the question because a draft landed."
    : "";
  const planLine =
    options?.queueLive === true
      ? " Call update_plan at most once to skip a queued section the files show is N/A, or to add an empty draftOrder section. Do not mark drafts done (automatic). Do not add lookups. If you are unsure, ask_user once instead of rewriting the queue."
      : options?.surface === "analytics"
        ? " Do not rewrite a remaining-work list. After a cited search hit, keep answering the follow-up while the write is still due; two empty greps still stop search. If unsure, ask_user once."
        : " Do not call update_plan. If a section may not apply, ask_user once.";
  return `## Remaining work this turn
${lines.length > 0 ? `${lines.join("\n")}\n` : ""}${lookupLine}${planLine}`.trim();
}

function payloadRecord(event: RemainingWorkEvent): Record<string, unknown> | null {
  const payload = unwrapToolPayload(event.output ?? event.result);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function payloadStatus(event: RemainingWorkEvent): string {
  const record = payloadRecord(event);
  const status = record?.status;
  return typeof status === "string" ? status : "";
}

function inputRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function inputSectionKey(input: unknown): string {
  const rec = inputRecord(input);
  const section = rec?.section;
  return typeof section === "string" ? section.trim() : "";
}

function writeProgressLanded(
  event: RemainingWorkEvent,
  writeToolNames: ReadonlySet<string>
): boolean {
  if (!writeToolNames.has(event.toolName)) return false;
  if (DOCUMENT_WRITE_PROGRESS_TOOLS.has(event.toolName)) {
    return planEditToolLanded(event);
  }
  const state = event.state ?? "";
  if (state === "output-error") return false;
  if (state && state !== "output-available" && state !== "") return false;
  const status = payloadStatus(event);
  if (!status) return true;
  return !WRITE_FAIL_STATUSES.has(status);
}

function parseUpdatePlanAction(input: unknown): UpdatePlanAction | null {
  const rec = inputRecord(input);
  if (!rec) return null;
  const action = rec.action;
  if (action !== "skip" && action !== "add_section") return null;
  const sectionKey =
    typeof rec.sectionKey === "string" ? rec.sectionKey.trim() : "";
  if (!sectionKey) return null;
  const reason = typeof rec.reason === "string" ? rec.reason.trim() : "";
  return { action, sectionKey, reason };
}

export function applyUpdatePlanAction(
  work: LivingTurnWork,
  action: UpdatePlanAction,
  ctx: RemainingWorkContext
): UpdatePlanResult {
  if (work.intent === "social") {
    return {
      status: "rejected",
      reason: "social",
      message: "This turn is small talk — the plan cannot change.",
    };
  }
  if (ctx.surface === "analytics") {
    return {
      status: "rejected",
      reason: "analytics_forbidden",
      message: "Analytics chat does not revise a remaining-section queue.",
    };
  }
  if (!ctx.queueLive) {
    return {
      status: "rejected",
      reason: "queue_inactive",
      message:
        "There is no live remaining-section queue. If a section may not apply, ask_user once.",
    };
  }
  const documentType = ctx.documentType ?? "investigation_report";
  const next = cloneLivingTurnWork(work);
  switch (action.action) {
    case "skip": {
      const item = next.items.find(
        (row) => row.kind === "section" && row.key === action.sectionKey
      );
      if (!item) {
        return {
          status: "rejected",
          reason: "missing_section",
          message: `${action.sectionKey} is not in this turn's remaining work.`,
        };
      }
      if (item.state === "in_progress") {
        return {
          status: "rejected",
          reason: "skip_in_progress",
          message:
            "Skip only queued sections, not the one in progress. Ask the engineer if this section should stop.",
        };
      }
      if (item.state !== "queued") {
        return {
          status: "rejected",
          reason: "skip_not_queued",
          message: `${item.label} is ${item.state}, not queued.`,
        };
      }
      item.state = "skipped";
      return { status: "updated", work: next, action: "skip", item: { ...item } };
    }
    case "add_section": {
      const key = action.sectionKey;
      if (!isChatEditableSection(key, documentType)) {
        return {
          status: "rejected",
          reason: "add_not_allowed",
          message: `${key} is not an editable draftOrder section.`,
        };
      }
      if (next.items.some((row) => row.kind === "section" && row.key === key)) {
        return {
          status: "rejected",
          reason: "add_already_present",
          message: `${key} is already in remaining work.`,
        };
      }
      if (!ctx.emptySectionKeys.includes(key)) {
        return {
          status: "rejected",
          reason: "add_not_empty",
          message: `${key} was not an empty draftOrder section at the start of this turn.`,
        };
      }
      const item: RemainingWorkItem = {
        id: `section:${key}`,
        kind: "section",
        key,
        label: sectionLabel(key),
        state: "queued",
        source: "update_plan",
      };
      next.items.push(item);
      return { status: "updated", work: next, action: "add_section", item };
    }
    default: {
      const exhaustive: never = action.action;
      return {
        status: "rejected",
        reason: "unknown_action",
        message: `Unsupported update_plan action: ${String(exhaustive)}`,
      };
    }
  }
}

export type MakePlanApplyResult =
  | { status: "planned"; work: LivingTurnWork; plan: ChatPendingPlan }
  | {
      status: "rejected";
      reason: MakePlanRejectReason | "social" | "analytics_forbidden" | "not_eligible";
      message: string;
    };

export function applyMakePlan(
  work: LivingTurnWork,
  input: MakePlanInput,
  ctx: RemainingWorkContext
): MakePlanApplyResult {
  if (work.intent === "social") {
    return {
      status: "rejected",
      reason: "social",
      message: "This turn is small talk — there is nothing to plan.",
    };
  }
  if (ctx.surface === "analytics") {
    return {
      status: "rejected",
      reason: "analytics_forbidden",
      message: "Analytics chat does not plan a section queue.",
    };
  }
  if (!ctx.makePlanEligible) {
    return {
      status: "rejected",
      reason: "not_eligible",
      message: "Planning is not available this turn. Just act on the request.",
    };
  }
  const result = validateMakePlan(input, {
    documentType: ctx.documentType ?? "investigation_report",
    planLive: ctx.queueLive || Boolean(work.createdPlan),
    promptVersion: ctx.promptVersion ?? "",
  });
  if (result.status === "rejected") return result;
  const next = cloneLivingTurnWork(work);
  for (const item of result.plan.items) {
    if (next.items.some((row) => row.kind === "section" && row.key === item.sectionKey)) {
      continue;
    }
    next.items.push({
      id: `section:${item.sectionKey}`,
      kind: "section",
      key: item.sectionKey,
      label: item.label,
      state: item.state === "in_progress" ? "in_progress" : "queued",
      source: "make_plan",
    });
  }
  result.lookups.forEach((question, index) => {
    next.items.push({
      id: `lookup:plan:${index + 1}`,
      kind: "lookup",
      key: `plan_lookup_${index + 1}`,
      label: question,
      state: "queued",
      source: "make_plan",
    });
  });
  next.createdPlan = result.plan;
  return { status: "planned", work: next, plan: result.plan };
}

export function applyRemainingWorkEvents(
  seed: LivingTurnWork,
  events: readonly RemainingWorkEvent[],
  ctx: RemainingWorkContext
): LivingTurnWork {
  let work = cloneLivingTurnWork(seed);
  for (const event of events) {
    if (event.toolName !== MAKE_PLAN_TOOL) continue;
    if (payloadStatus(event) !== "planned") continue;
    const input = parseMakePlanInput(event.input);
    if (!input) continue;
    const result = applyMakePlan(work, input, ctx);
    if (result.status === "planned") work = result.work;
  }
  const drafted = new Set<string>();
  for (const event of events) {
    if (!writeProgressLanded(event, ctx.writeToolNames)) continue;
    work.writeOutstanding = false;
    const section = inputSectionKey(event.input);
    if (!section) continue;
    drafted.add(section);
    work.items = work.items.map((item) =>
      item.kind === "section" && item.key === section && item.state !== "skipped"
        ? { ...item, state: "done" as const }
        : item
    );
  }
  for (const event of events) {
    if (event.toolName !== UPDATE_PLAN_TOOL) continue;
    if (payloadStatus(event) !== "updated") continue;
    const action = parseUpdatePlanAction(event.input);
    if (!action) continue;
    const result = applyUpdatePlanAction(work, action, ctx);
    if (result.status !== "updated") continue;
    work = result.work;
    if (
      result.action === "add_section" &&
      drafted.has(result.item.key)
    ) {
      work.items = work.items.map((item) =>
        item.id === result.item.id ? { ...item, state: "done" as const } : item
      );
    }
  }
  return work;
}

function callInput(call: ToolCallLike): unknown {
  return call.input ?? call.args;
}

export function remainingWorkEventsFromSteps(
  steps: readonly SearchLoopStep[]
): RemainingWorkEvent[] {
  const events: RemainingWorkEvent[] = [];
  for (const step of steps) {
    const calls = collectToolCalls(step);
    const inputById = new Map<string, unknown>();
    const inputByName = new Map<string, unknown>();
    for (const call of calls) {
      const id = typeof call.toolCallId === "string" ? call.toolCallId : "";
      const input = callInput(call);
      if (id) inputById.set(id, input);
      const name = callToolName(call);
      if (name && !inputByName.has(name)) inputByName.set(name, input);
    }
    const results: ToolResultLike[] = [...(step.toolResults ?? [])];
    if (results.length === 0) continue;
    for (const result of results) {
      const name = callToolName(result);
      if (!name) continue;
      const id = typeof result.toolCallId === "string" ? result.toolCallId : "";
      events.push({
        toolName: name,
        input: (id ? inputById.get(id) : undefined) ?? inputByName.get(name),
        output: result.output,
        result: result.result,
        state: "output-available",
      });
    }
  }
  return events;
}

export function remainingWorkEventsFromParts(
  parts: unknown
): RemainingWorkEvent[] {
  if (!Array.isArray(parts)) return [];
  const events: RemainingWorkEvent[] = [];
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
    if (!name) continue;
    events.push({
      toolName: name,
      input: rec.input,
      output: rec.output,
      result: rec.result,
      state: typeof rec.state === "string" ? rec.state : "",
    });
  }
  return events;
}

export function applyStepsToLivingTurnWork(
  seed: LivingTurnWork,
  steps: readonly SearchLoopStep[],
  ctx: RemainingWorkContext
): LivingTurnWork {
  return applyRemainingWorkEvents(
    seed,
    remainingWorkEventsFromSteps(steps),
    ctx
  );
}

function updatePlanAttemptCount(events: readonly RemainingWorkEvent[]): {
  attempts: number;
  successes: number;
  askedUser: boolean;
} {
  let attempts = 0;
  let successes = 0;
  let askedUser = false;
  for (const event of events) {
    if (event.toolName === "ask_user") {
      const state = event.state ?? "";
      if (!state || state === "output-available") askedUser = true;
    }
    if (event.toolName !== UPDATE_PLAN_TOOL) continue;
    const state = event.state ?? "";
    if (state === "output-error") continue;
    if (state && state !== "output-available" && state !== "") continue;
    attempts += 1;
    if (payloadStatus(event) === "updated") successes += 1;
  }
  return { attempts, successes, askedUser };
}

export type UpdatePlanLoopDirective = "continue" | "hide";

/**
 * Hide update_plan after one success, two attempts, or any ask_user.
 * Unsure skip/add belongs on ask_user, not another plan rewrite.
 */
export function updatePlanLoopDirective(
  steps: readonly SearchLoopStep[]
): UpdatePlanLoopDirective {
  const { attempts, successes, askedUser } = updatePlanAttemptCount(
    remainingWorkEventsFromSteps(steps)
  );
  if (askedUser) return "hide";
  if (successes >= UPDATE_PLAN_SUCCESS_LIMIT) return "hide";
  if (attempts >= UPDATE_PLAN_ATTEMPT_LIMIT) return "hide";
  return "continue";
}

/**
 * Hide make_plan after one plan, two attempts, any ask_user, or once a write
 * has landed. A plan is written before drafting, not narrated afterwards.
 */
export function makePlanLoopDirective(
  steps: readonly SearchLoopStep[],
  writeToolNames: ReadonlySet<string>
): UpdatePlanLoopDirective {
  let attempts = 0;
  let successes = 0;
  for (const event of remainingWorkEventsFromSteps(steps)) {
    if (event.toolName === "ask_user") return "hide";
    if (writeProgressLanded(event, writeToolNames)) return "hide";
    if (event.toolName !== MAKE_PLAN_TOOL) continue;
    attempts += 1;
    if (payloadStatus(event) === "planned") successes += 1;
  }
  if (successes >= MAKE_PLAN_SUCCESS_LIMIT) return "hide";
  if (attempts >= MAKE_PLAN_ATTEMPT_LIMIT) return "hide";
  return "continue";
}

export function mergeLivingWorkIntoPendingPlan(
  plan: ChatPendingPlan | null,
  work: LivingTurnWork
): ChatPendingPlan | null {
  if (work.createdPlan && (!plan || plan.paused)) return work.createdPlan;
  if (!plan || plan.paused) return plan;
  const items: ChatPlanItem[] = plan.items.map((item) => {
    const living = work.items.find(
      (row) => row.kind === "section" && row.key === item.sectionKey
    );
    if (living?.state === "skipped" && item.state === "queued") {
      return { ...item, state: "skipped" as const };
    }
    return item;
  });
  for (const living of work.items) {
    if (living.kind !== "section") continue;
    if (living.source !== "update_plan") continue;
    if (items.some((item) => item.sectionKey === living.key)) continue;
    items.push({
      sectionKey: living.key,
      label: living.label,
      state: living.state === "done" ? "done" : "queued",
    });
  }
  return { ...plan, items };
}

export function isUpdatePlanActionName(
  value: unknown
): value is UpdatePlanActionName {
  return (
    typeof value === "string" &&
    (UPDATE_PLAN_ACTIONS as readonly string[]).includes(value)
  );
}
