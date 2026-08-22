import type { DocumentType, SectionType } from "@/db/schema";
import type { ChatSectionScope } from "@/lib/ai/chat/fields";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import { requirementIds } from "@/lib/attachments/ocr-quality";
import { getDocumentType } from "@/lib/document-types";

export const RETRIEVAL_POLICIES = ["focused", "adaptive", "comprehensive"] as const;
export type RetrievalPolicy = (typeof RETRIEVAL_POLICIES)[number];

export type RetrievalPolicyDecision = {
  policy: RetrievalPolicy;
  reason: string;
};

/** Ready-page count at or above this is a distributed catalog, not one locus. */
export const DISTRIBUTED_READY_PAGES = 12;
/** Outline siblings at or above this also count as distributed evidence. */
export const DISTRIBUTED_OUTLINE_SIBLINGS = 6;

const FOCUSED_OVERRIDE_RE =
  /\b(quick(?:ly)?|high[- ]level|brief overview|just (?:a )?summary|summary only|skim)\b/i;

const COMPREHENSIVE_SHAPE_RE =
  /\b(traceability(?:\s+matrix)?|requirements?\s*(?:and|&|\/)\s*results?|results?\s+and\s+discussions|req(?:uirement)?[- ]?id|results?\s+table|inventory|complete\s+(?:list|table|review|pass|set(?:\s+of)?(?:\s+test)?\s+cases?|test\s+cases?)|every\s+(?:requirement|test|page|row)|all\s+(?:the\s+)?(?:requirements?|tests?|pages?|results?|answers)|comprehensive|full\s+(?:review|pass|inventory|table|matrix)|missing\s+tests?|don'?t miss|do not miss)\b/i;

const KEEP_GOING_RE =
  /\b(keep going|continue (?:the )?(?:review|reading|extraction|going)|you missed|still missing|what about|didn'?t (?:include|cover)|more (?:tests?|requirements?)|be comprehensive)\b/i;

/** Standalone family codes, not a hyphenated requirement id like SW-LWB-4. */
const TEST_FAMILY_RE = /(?<![\w-])(sst|sib|lwb|lcb|sdt)(?!-\d)/i;

const ROW_CELL_RE = /\b(?:this|that)\s+(?:row|cell)\b/i;

const PAGE_LOCATOR_RE = /\b(?:page|p\.)\s*\d+\b/i;

const SERIAL_ASSET_RE =
  /\b(?:serial(?:\s*(?:no\.?|number|#))?|s\/n|asset\s+tag)\b/i;

const OPEN_SET_PRODUCE_RE =
  /\b(?:draft|write(?:\s+(?:up|out|the))?|prepare|populate|fill(?:\s+(?:in|out|the))?|complete)\b/i;

const NARROW_FACT_RE =
  /\b(?:what(?:'s| is| was| are)|who (?:is|are|was)|when (?:is|was|did)|where (?:is|was)|which [a-z][\w-]* (?:is|was|did|were))\b/i;

const NARROW_FACT_EXCLUDE_RE =
  /\b(?:draft|fill|write|populate|complete the|do this section)\b/i;

/**
 * Known inventory section keys used only when `documentType` is omitted
 * (unit tests / callers that have not wired the registry yet).
 */
const FALLBACK_INVENTORY_SECTIONS = new Set<string>([
  "traceability",
  "test_results",
  "results_and_discussions",
]);

export type ClassifyRetrievalPolicyInput = {
  userText: string;
  recentUserTexts?: readonly string[];
  sectionScope?: ChatSectionScope | SectionType | "all";
  documentType?: DocumentType;
  mentionedPageCount?: number;
  totalReadyPages?: number;
  outlineSiblingCount?: number;
  hasDocuments?: boolean;
};

export function recentUserMessageTexts(
  messages: ReadonlyArray<{ role: string; parts?: readonly unknown[] }>,
  limit = 4
): string[] {
  const texts: string[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = textFromParts(message.parts).trim();
    if (text) texts.push(text);
  }
  return texts.slice(-Math.max(1, limit));
}

/**
 * Classifier picks the extremes. Default is adaptive: the model greps.
 * Comprehensive is the page-walk for open sets (unnamed members, distributed
 * source) and explicit every-row inventories. Focused is an explicit skim.
 *
 * Order: no docs → keep-going → bounded locator → skim → shape backup →
 * scoped inventory section → scope-all (non-inventory intent / narrow fact /
 * open-set + distributed) → adaptive.
 */
export function classifyRetrievalPolicy(
  input: ClassifyRetrievalPolicyInput
): RetrievalPolicyDecision {
  const recent = (input.recentUserTexts ?? []).map((text) => text.trim()).filter(Boolean);
  const combined = [input.userText, ...recent].filter(Boolean).join("\n");
  const latest = input.userText.trim();

  if (input.hasDocuments === false) {
    return { policy: "focused", reason: "no_documents" };
  }

  const scope = input.sectionScope ?? "all";
  const inventory = inventorySectionsFor(input.documentType);

  if (KEEP_GOING_RE.test(latest) || TEST_FAMILY_RE.test(latest)) {
    return { policy: "comprehensive", reason: "completeness_follow_up" };
  }

  if (isBoundedLocator(latest)) {
    return { policy: "adaptive", reason: "bounded_locator" };
  }

  if (FOCUSED_OVERRIDE_RE.test(latest) && !hasInventoryLanguage(combined)) {
    return { policy: "focused", reason: "explicit_quick_overview" };
  }

  if (COMPREHENSIVE_SHAPE_RE.test(combined)) {
    return { policy: "comprehensive", reason: "exhaustive_output_shape" };
  }

  if (
    typeof scope === "string" &&
    scope !== "all" &&
    isInventorySection(scope, input.documentType)
  ) {
    return { policy: "comprehensive", reason: "matrix_section_inventory" };
  }

  if (scope === "all" && input.documentType) {
    const intent = detectSectionIntentFromText(combined, input.documentType);
    if (intent && !inventory.has(intent)) {
      return { policy: "adaptive", reason: "agentic_default" };
    }
    if (isNarrowFact(latest)) {
      return { policy: "adaptive", reason: "agentic_default" };
    }
    if (
      inventory.size > 0 &&
      isDistributedEvidence(input) &&
      OPEN_SET_PRODUCE_RE.test(combined)
    ) {
      return { policy: "comprehensive", reason: "open_set_distributed" };
    }
  }

  return { policy: "adaptive", reason: "agentic_default" };
}

function inventorySectionsFor(
  documentType: DocumentType | undefined
): ReadonlySet<string> {
  if (!documentType) return new Set();
  return new Set(getDocumentType(documentType).chat.inventorySections ?? []);
}

function isInventorySection(
  section: string,
  documentType: DocumentType | undefined
): boolean {
  if (documentType) {
    return inventorySectionsFor(documentType).has(section);
  }
  return FALLBACK_INVENTORY_SECTIONS.has(section);
}

function hasInventoryLanguage(text: string): boolean {
  return (
    COMPREHENSIVE_SHAPE_RE.test(text) ||
    KEEP_GOING_RE.test(text) ||
    TEST_FAMILY_RE.test(text)
  );
}

function isBoundedLocator(text: string): boolean {
  if (!text || hasInventoryLanguage(text)) return false;
  if (ROW_CELL_RE.test(text)) return true;
  const ids = requirementIds(text);
  if (ids.length >= 1 && ids.length <= 3) return true;
  if (PAGE_LOCATOR_RE.test(text)) return true;
  return SERIAL_ASSET_RE.test(text);
}

function isNarrowFact(text: string): boolean {
  if (hasInventoryLanguage(text) || NARROW_FACT_EXCLUDE_RE.test(text)) {
    return false;
  }
  return NARROW_FACT_RE.test(text);
}

function isDistributedEvidence(input: ClassifyRetrievalPolicyInput): boolean {
  const mentioned = input.mentionedPageCount ?? 0;
  const pages = mentioned > 0 ? mentioned : (input.totalReadyPages ?? 0);
  if (pages >= DISTRIBUTED_READY_PAGES) return true;
  return (input.outlineSiblingCount ?? 0) >= DISTRIBUTED_OUTLINE_SIBLINGS;
}

function textFromParts(parts: readonly unknown[] | undefined): string {
  if (!parts) return "";
  return parts
    .flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const record = part as { type?: unknown; text?: unknown };
      if (record.type !== "text" || typeof record.text !== "string") return [];
      return [record.text];
    })
    .join(" ");
}
