import type { DocumentType } from "@/db/schema";
import { sectionLabel } from "@/lib/ai/chat/fields";
import { isQsrRtmSection } from "@/lib/ai/chat/qsr-row-grounding";
import { getDocumentType } from "@/lib/document-types";

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
