import type { DocumentType } from "@/db/schema";
import { isChatEditableSection, sectionLabel } from "@/lib/ai/chat/fields";
import type { ChatPendingPlan, ChatPlanItem } from "@/lib/ai/chat/pending-plan";
import { detectSectionIntentsFromText } from "@/lib/ai/chat/section-intent";
import { getDocumentType } from "@/lib/document-types";
import { orderPlanSectionItems } from "@/lib/ai/chat/plan-execution";

/**
 * General-purpose planner (stage 1). The orchestrator may call `make_plan`
 * once, before drafting, when rules did not seed a queue. Section steps
 * persist as the `pending_plan` section queue (auto-continue, stuck limit,
 * progress chip unchanged). Lookup steps live in this turn's remaining-work
 * ledger only. The server marks steps done — the model never does.
 */
export const MAKE_PLAN_TOOL = "make_plan";

export const MAKE_PLAN_STEP_KINDS = ["section", "lookup"] as const;
export type MakePlanStepKind = (typeof MAKE_PLAN_STEP_KINDS)[number];

export const MAKE_PLAN_MIN_STEPS = 2;
export const MAKE_PLAN_MAX_STEPS = 8;
/** One plan per turn. A second call is hidden. */
export const MAKE_PLAN_SUCCESS_LIMIT = 1;
/** Rejected retries burn the slot too, so a bad key cannot loop. */
export const MAKE_PLAN_ATTEMPT_LIMIT = 2;

export type MakePlanStepInput = {
  kind: MakePlanStepKind;
  section?: string;
  question?: string;
};

export type MakePlanInput = {
  objective: string;
  steps: MakePlanStepInput[];
};

export type MakePlanContext = {
  documentType: DocumentType;
  /** A rules-seeded or earlier plan is live — revise it with update_plan instead. */
  planLive: boolean;
  promptVersion: string;
  now?: Date;
};

export type MakePlanRejectReason =
  | "plan_live"
  | "too_few_steps"
  | "too_many_steps"
  | "no_section_step"
  | "unknown_kind"
  | "missing_section"
  | "section_not_editable"
  | "duplicate_section"
  | "missing_question";

export type MakePlanResult =
  | {
      status: "planned";
      plan: ChatPendingPlan;
      lookups: string[];
    }
  | {
      status: "rejected";
      reason: MakePlanRejectReason;
      message: string;
    };

function isMakePlanStepKind(value: unknown): value is MakePlanStepKind {
  return (
    typeof value === "string" &&
    (MAKE_PLAN_STEP_KINDS as readonly string[]).includes(value)
  );
}

function reject(reason: MakePlanRejectReason, message: string): MakePlanResult {
  return { status: "rejected", reason, message };
}

export function parseMakePlanInput(value: unknown): MakePlanInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const objective =
    typeof rec.objective === "string" ? rec.objective.trim() : "";
  if (!objective || !Array.isArray(rec.steps)) return null;
  const steps: MakePlanStepInput[] = [];
  for (const raw of rec.steps) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (!isMakePlanStepKind(row.kind)) return null;
    steps.push({
      kind: row.kind,
      ...(typeof row.section === "string" ? { section: row.section.trim() } : {}),
      ...(typeof row.question === "string"
        ? { question: row.question.trim() }
        : {}),
    });
  }
  return { objective, steps };
}

/**
 * Validate a `make_plan` call. Section steps must be editable keys for this
 * document type (filled sections are allowed — "tighten 1, 2 and 3" is a
 * plan too). Recap/conclusion steps move last; other steps keep the
 * orchestrator's order. The first remaining section starts in progress.
 */
export function validateMakePlan(
  input: MakePlanInput,
  ctx: MakePlanContext
): MakePlanResult {
  if (ctx.planLive) {
    return reject(
      "plan_live",
      "A remaining-section plan is already live. Revise it with update_plan, or just act."
    );
  }
  if (input.steps.length < MAKE_PLAN_MIN_STEPS) {
    return reject(
      "too_few_steps",
      "A plan needs at least two steps. For a single edit, just do it."
    );
  }
  if (input.steps.length > MAKE_PLAN_MAX_STEPS) {
    return reject(
      "too_many_steps",
      `A plan has at most ${MAKE_PLAN_MAX_STEPS} steps. Merge related steps.`
    );
  }
  const items: ChatPlanItem[] = [];
  const lookups: string[] = [];
  const seen = new Set<string>();
  for (const step of input.steps) {
    switch (step.kind) {
      case "section": {
        const key = step.section?.trim() ?? "";
        if (!key) {
          return reject("missing_section", "Every section step needs a section key.");
        }
        if (!isChatEditableSection(key, ctx.documentType)) {
          const keys = getDocumentType(ctx.documentType).chat.draftOrder.join(", ");
          return reject(
            "section_not_editable",
            `${key} is not an editable section. Use one of: ${keys}.`
          );
        }
        if (seen.has(key)) {
          return reject("duplicate_section", `${key} appears twice. List each section once.`);
        }
        seen.add(key);
        items.push({
          sectionKey: key,
          label: sectionLabel(key),
          state: "queued",
        });
        break;
      }
      case "lookup": {
        const question = step.question?.trim() ?? "";
        if (!question) {
          return reject("missing_question", "Every lookup step needs the question to answer.");
        }
        lookups.push(question.slice(0, 300));
        break;
      }
      default: {
        const exhaustive: never = step.kind;
        return reject("unknown_kind", `Unsupported step kind: ${String(exhaustive)}`);
      }
    }
  }
  if (items.length === 0) {
    return reject(
      "no_section_step",
      "A plan needs at least one section step. Answer questions directly without a plan."
    );
  }
  const ordered = orderPlanSectionItems(items, ctx.documentType).map(
    (item, index) => ({
      ...item,
      state: index === 0 ? ("in_progress" as const) : ("queued" as const),
    })
  );
  return {
    status: "planned",
    plan: {
      kind: "section_queue",
      source: "make_plan",
      objective: input.objective.slice(0, 500),
      items: ordered,
      createdAt: (ctx.now ?? new Date()).toISOString(),
      promptVersion: ctx.promptVersion,
    },
    lookups,
  };
}

const CLAUSE_SPLIT_RE = /[,;\n]|\b(?:and then|then|also|after that|plus)\b/gi;
const MULTI_STEP_MIN_WORDS = 8;

/**
 * Cheap gate for loading `make_plan`. It is optional for the model, so a false
 * positive only costs one advertised tool. A false negative means the turn runs
 * without a plan, same as before.
 */
export function looksMultiStepAsk(input: {
  userText: string;
  documentType: DocumentType;
  alsoLookup: boolean;
}): boolean {
  if (input.alsoLookup) return true;
  const text = input.userText.trim();
  if (!text) return false;
  if (detectSectionIntentsFromText(text, input.documentType).length >= 2) {
    return true;
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < MULTI_STEP_MIN_WORDS) return false;
  const separators = text.match(CLAUSE_SPLIT_RE)?.length ?? 0;
  return separators >= 2;
}

export function makePlanEligible(input: {
  mode: "plan" | "agent";
  intent: "social" | "read" | "write";
  canEdit: boolean;
  planLive: boolean;
  userText: string;
  documentType: DocumentType;
  alsoLookup: boolean;
  autoContinue: boolean;
}): boolean {
  if (input.mode !== "agent") return false;
  if (input.intent !== "write") return false;
  if (!input.canEdit || input.planLive || input.autoContinue) return false;
  return looksMultiStepAsk(input);
}

export function makePlanPromptBlock(): string {
  return `## Planning
This ask may have several parts, and rules could not seed the section list. Before drafting, call make_plan once with 2–${MAKE_PLAN_MAX_STEPS} ordered steps: section steps (section key from the context map) and lookup steps (the question to answer this turn). Section steps become the remaining-section queue — this turn drafts the first (or first two independent siblings) and later steps continue automatically. Put recap/conclusion last; the server moves it last if you do not. Independent inventory siblings (same evidence family, e.g. QSR RTM 5.1–5.6) may share a turn after one review. A whole-report ask ("draft the report") is already a queue when the section list has empty items — do not replan it. Page extracts already run as a parallel worker pool. Skip make_plan when one section edit covers the ask. Progress is automatic — never call it to mark a step done. If you are unsure which sections apply, ask_user once instead of planning.`;
}
