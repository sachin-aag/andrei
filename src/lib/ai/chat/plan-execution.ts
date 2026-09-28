import type { DocumentType } from "@/db/schema";
import { sectionLabel } from "@/lib/ai/chat/fields";
import { isQsrRtmSection } from "@/lib/ai/chat/qsr-row-grounding";
import { detectSectionIntentsFromText } from "@/lib/ai/chat/section-intent";
import { getDocumentType } from "@/lib/document-types";

/** How many independent siblings one turn may draft together. */
export const PARALLEL_BATCH_CAP = 3;

const LOCAL_SPAN_RE =
  /\b(?:typo|spelling|grammar|this sentence|this paragraph|this line|this word|wording|one sentence)\b/i;

const WRITE_VERB_RE =
  /\b(?:draft|write|fill(?:\s+(?:in|out))?|complete|prepare|populate)\b/i;

const DOCUMENT_SCOPE_RE =
  /\b(?:report|document|elr|qsr|everything|all (?:the )?(?:empty )?sections?|remaining|whole|qualification summary|from the (?:attachments|files|pdfs|protocols|documents))\b/i;

const MULTI_SECTION_DRAFT_RE =
  /\b(?:remaining (?:sections?|report|document|elr)|all (?:the )?(?:empty )?sections?|every section|entire (?:report|document)|whole (?:report|document)|(?:draft|write|fill(?:\s+(?:in|out))?|populate|complete)\s+(?:the )?(?:remaining |rest of (?:the )?)?(?:report|document|elr)|fill(?:\s+(?:in|out))?\s+(?:the )?(?:rest|remaining)|sections? after (?:that|this)|(?:the )?(?:rest|remaining) after (?:that|this)|and (?:then )?(?:the )?(?:rest|remaining sections?)|(?:draft|write|fill(?:\s+in)?|complete|prepare|populate)\s+(?:it|this)(?:\s+up)?)\b/i;

const CLAUSE_SPLIT_RE = /[,;\n]|\b(?:and then|then|also|after that|plus)\b/gi;

/**
 * Server-owned execution for remaining-section work. Recap/conclusion
 * sections wait for earlier bodies (sequential queue). Sibling tables that
 * share evidence (QSR RTM 5.1–5.6) may share a turn. Page extracts already
 * run as a worker pool — this is not a parallel LLM subagent runtime.
 */
export type PlanExecutionMode = "queue" | "independent";

export type PlanSectionItem = {
  sectionKey: string;
  label: string;
  state: string;
  attempts?: number;
};

export type RecapWriteGateInput = {
  section: string;
  documentType: DocumentType;
  emptySectionKeys: readonly string[];
  namedSectionKeys: readonly string[];
  sectionScope?: string | null;
  plan?: {
    paused?: boolean;
    items: readonly PlanSectionItem[];
  } | null;
  /** Sections this remaining-section turn is allowed to draft. */
  planTurnKeys?: readonly string[];
};

const RECAP_NAME_RE = /conclusion|recommendation/i;

function draftOrderIndex(documentType: DocumentType, section: string): number {
  const order = getDocumentType(documentType).chat.draftOrder;
  const index = (order as readonly string[]).indexOf(section);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Terminal recap of earlier bodies — QSR 7 Conclusion, ELR 5.3, investigation
 * Conclusion, QRA post-implementation conclusion. Mid-document summaries
 * (QRA pre-conclusion) stay in draftOrder.
 */
export function isDependentRecapSection(
  section: string,
  documentType: DocumentType
): boolean {
  const order = getDocumentType(documentType).chat.draftOrder;
  const last = order[order.length - 1];
  if (!last || section !== last) return false;
  return RECAP_NAME_RE.test(`${section} ${sectionLabel(section)}`);
}

/**
 * Sibling sections that share evidence and may share a remaining-section
 * turn. `null` means sequential (own review, or a recap).
 */
function inventorySectionKeys(documentType: DocumentType): readonly string[] {
  return (getDocumentType(documentType).chat.inventorySections ??
    []) as readonly string[];
}

function isInventorySection(section: string, documentType: DocumentType): boolean {
  return inventorySectionKeys(documentType).includes(section);
}

export function planIndependentFamily(
  section: string,
  documentType: DocumentType
): string | null {
  if (isDependentRecapSection(section, documentType)) return null;
  if (isQsrRtmSection(section)) return "qsr_rtm";
  if (isInventorySection(section, documentType)) return null;
  return "prose";
}

export function orderSectionKeys(
  keys: readonly string[],
  documentType: DocumentType
): string[] {
  const recaps: string[] = [];
  const rest: string[] = [];
  for (const key of keys) {
    if (isDependentRecapSection(key, documentType)) recaps.push(key);
    else rest.push(key);
  }
  recaps.sort(
    (a, b) => draftOrderIndex(documentType, a) - draftOrderIndex(documentType, b)
  );
  return [...rest, ...recaps];
}

export function orderPlanSectionItems<T extends PlanSectionItem>(
  items: readonly T[],
  documentType: DocumentType
): T[] {
  const byKey = new Map(items.map((item) => [item.sectionKey, item]));
  return orderSectionKeys(
    items.map((item) => item.sectionKey),
    documentType
  ).flatMap((key) => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
}

export function planExecutionMode(
  items: readonly PlanSectionItem[],
  documentType: DocumentType
): PlanExecutionMode {
  const open = items.filter(
    (item) => item.state !== "done" && item.state !== "skipped"
  );
  if (open.some((item) => isDependentRecapSection(item.sectionKey, documentType))) {
    if (
      open.some(
        (item) => !isDependentRecapSection(item.sectionKey, documentType)
      )
    ) {
      return "queue";
    }
  }
  const families = new Set(
    open
      .map((item) => planIndependentFamily(item.sectionKey, documentType))
      .filter((family): family is string => family != null)
  );
  if (families.size === 1 && families.has("qsr_rtm")) return "independent";
  return "queue";
}

export function planExecutionPromptLine(
  items: readonly PlanSectionItem[],
  documentType: DocumentType
): string {
  const mode = planExecutionMode(items, documentType);
  if (mode === "independent") {
    return " These sibling sections share evidence — after one review, fill this turn's pair. Page extracts already run as a parallel worker pool. Draft the current pair in this turn; later pairs continue automatically.";
  }
  return " This is a sequential remaining-section queue built from the section list (empty items, conclusion last). Recap/conclusion waits until earlier items are done. Independent inventory siblings may share a turn. Page extracts already run as a parallel worker pool — draft the current item, then the next turn continues.";
}

function earlierEmptyKeys(
  section: string,
  documentType: DocumentType,
  emptySectionKeys: readonly string[]
): string[] {
  const sectionIndex = draftOrderIndex(documentType, section);
  return emptySectionKeys.filter(
    (key) =>
      key !== section && draftOrderIndex(documentType, key) < sectionIndex
  );
}

function explicitRecapOnly(
  section: string,
  namedSectionKeys: readonly string[],
  sectionScope?: string | null
): boolean {
  if (sectionScope && sectionScope !== "all" && sectionScope === section) {
    return true;
  }
  return namedSectionKeys.length === 1 && namedSectionKeys[0] === section;
}

/**
 * Refuse drafting a terminal recap while earlier empty bodies remain, unless
 * the engineer asked only for that recap or the remaining-section turn has
 * already reached it.
 */
export function recapWriteNotReady(
  input: RecapWriteGateInput
): { message: string } | null {
  if (!isDependentRecapSection(input.section, input.documentType)) return null;
  if (
    explicitRecapOnly(
      input.section,
      input.namedSectionKeys,
      input.sectionScope
    )
  ) {
    return null;
  }
  const plan = input.plan && input.plan.paused !== true ? input.plan : null;
  if (plan) {
    const turnKeys = new Set(
      input.planTurnKeys && input.planTurnKeys.length > 0
        ? input.planTurnKeys
        : []
    );
    if (turnKeys.has(input.section)) return null;
    if (turnKeys.size > 0) {
      const currentLabel = plan.items.find((item) =>
        turnKeys.has(item.sectionKey)
      )?.label;
      return {
        message: `${sectionLabel(input.section)} recaps earlier sections. This turn is ${currentLabel ?? "an earlier section"} — draft that first.`,
      };
    }
  }
  const earlier = earlierEmptyKeys(
    input.section,
    input.documentType,
    input.emptySectionKeys
  );
  if (earlier.length === 0) return null;
  const next = earlier[0]!;
  return {
    message: `${sectionLabel(input.section)} recaps the rest of the report. Draft ${sectionLabel(next)} (and the other remaining sections) first.`,
  };
}

export type ChatExecutionDecision =
  | { kind: "single"; reason: string }
  | { kind: "queue"; reason: string; scope: "named" | "document" }
  | { kind: "require_model_plan"; reason: string };

/**
 * A write aimed at the document as a whole. Local span edits ("fix the
 * typo") stay single. This is the section list plus the ask, not one phrase.
 */
export function isDocumentWideWrite(userText: string): boolean {
  const text = userText.trim();
  if (!text || LOCAL_SPAN_RE.test(text)) return false;
  if (MULTI_SECTION_DRAFT_RE.test(text)) return true;
  return WRITE_VERB_RE.test(text) && DOCUMENT_SCOPE_RE.test(text);
}

function looksLikeSeveralParts(userText: string, documentType: DocumentType): boolean {
  const text = userText.trim();
  if (detectSectionIntentsFromText(text, documentType).length >= 2) return true;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 8) return false;
  return (text.match(CLAUSE_SPLIT_RE)?.length ?? 0) >= 2;
}

/**
 * What this write should execute. Known sections become a queue. A write
 * the section list cannot compile must be planned before any draft.
 * A single named section just runs.
 */
export function compileChatExecutionPlan(input: {
  userText: string;
  documentType: DocumentType;
  intent: "social" | "read" | "write";
  alsoLookup?: boolean;
  sectionScope?: string | null;
  emptySectionKeys?: readonly string[];
}): ChatExecutionDecision {
  if (input.intent !== "write") {
    return { kind: "single", reason: "not a write" };
  }
  const named = detectSectionIntentsFromText(input.userText, input.documentType);
  const scoped =
    input.sectionScope && input.sectionScope !== "all" ? input.sectionScope : null;
  if (LOCAL_SPAN_RE.test(input.userText) && named.length <= 1 && !input.alsoLookup) {
    return { kind: "single", reason: "local span edit" };
  }
  if (named.length >= 2 && input.alsoLookup) {
    return {
      kind: "require_model_plan",
      reason: "several sections plus a question — a section queue would drop the question",
    };
  }
  if (named.length >= 2) {
    return { kind: "queue", scope: "named", reason: "named sections from the outline" };
  }
  const emptyCount = input.emptySectionKeys?.length ?? 0;
  if (isDocumentWideWrite(input.userText) && emptyCount >= 2) {
    return {
      kind: "queue",
      scope: "document",
      reason: "document-wide write — queue the empty section list, conclusion last",
    };
  }
  if (named.length === 1 || scoped) {
    return { kind: "single", reason: "one section" };
  }
  if (input.alsoLookup || looksLikeSeveralParts(input.userText, input.documentType)) {
    return {
      kind: "require_model_plan",
      reason: "multi-part write the section list cannot compile",
    };
  }
  return { kind: "single", reason: "one edit" };
}

export function shouldPairPlanSections(
  currentKey: string,
  nextKey: string,
  documentType: DocumentType
): boolean {
  if (isDependentRecapSection(currentKey, documentType)) return false;
  if (isDependentRecapSection(nextKey, documentType)) return false;
  const family = planIndependentFamily(currentKey, documentType);
  const nextFamily = planIndependentFamily(nextKey, documentType);
  if (family && family === nextFamily) return true;
  return (
    !isInventorySection(currentKey, documentType) &&
    !isInventorySection(nextKey, documentType)
  );
}
