import type { DocumentType, SectionType } from "@/db/schema";
import type { ChatSectionScope } from "@/lib/ai/chat/fields";

export const RETRIEVAL_POLICIES = ["focused", "adaptive", "comprehensive"] as const;
export type RetrievalPolicy = (typeof RETRIEVAL_POLICIES)[number];

export type RetrievalPolicyDecision = {
  policy: RetrievalPolicy;
  reason: string;
};

const FOCUSED_OVERRIDE_RE =
  /\b(quick(?:ly)?|high[- ]level|brief overview|just (?:a )?summary|summary only|skim)\b/i;

const COMPREHENSIVE_SHAPE_RE =
  /\b(traceability(?:\s+matrix)?|requirements?\s*(?:and|&|\/)\s*results?|req(?:uirement)?[- ]?id|results?\s+table|inventory|complete\s+(?:list|table|review|pass)|every\s+(?:requirement|test|page|row)|all\s+(?:the\s+)?(?:requirements?|tests?|pages?|results?|answers)|comprehensive|full\s+(?:review|pass|inventory|table|matrix)|missing\s+tests?|don'?t miss|do not miss)\b/i;

const KEEP_GOING_RE =
  /\b(keep going|continue (?:the )?(?:review|reading|extraction|going)|you missed|still missing|what about|didn'?t (?:include|cover)|more (?:tests?|requirements?)|be comprehensive)\b/i;

/** Standalone family codes, not a hyphenated requirement id like SW-LWB-4. */
const TEST_FAMILY_RE = /(?<![\w-])(sst|sib|lwb|lcb|sdt)(?!-\d)/i;

const INVENTORY_ACTION_RE =
  /\b(table|matrix|list|inventory|fill|draft|complete|every|all|missing)\b/i;

const MATRIX_SECTIONS = new Set<string>(["traceability", "test_results"]);

export type ClassifyRetrievalPolicyInput = {
  userText: string;
  recentUserTexts?: readonly string[];
  sectionScope?: ChatSectionScope | SectionType | "all";
  documentType?: DocumentType;
  mentionedPageCount?: number;
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
 * Classifier only picks the extremes. Default is adaptive: the model owns
 * retrieval (complementary search, outline, neighboring pages) the way a
 * coding agent greps a repo. Comprehensive is the page-walk for true
 * every-row inventories. Focused is an explicit skim.
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

  if (FOCUSED_OVERRIDE_RE.test(latest)) {
    return { policy: "focused", reason: "explicit_quick_overview" };
  }

  if (COMPREHENSIVE_SHAPE_RE.test(combined)) {
    return { policy: "comprehensive", reason: "exhaustive_output_shape" };
  }

  if (KEEP_GOING_RE.test(latest) || TEST_FAMILY_RE.test(latest)) {
    return { policy: "comprehensive", reason: "completeness_follow_up" };
  }

  const scope = input.sectionScope ?? "all";
  if (
    typeof scope === "string" &&
    MATRIX_SECTIONS.has(scope) &&
    INVENTORY_ACTION_RE.test(combined)
  ) {
    return { policy: "comprehensive", reason: "matrix_section_inventory" };
  }

  return { policy: "adaptive", reason: "agentic_default" };
}

/**
 * Thinking runs on every orchestrator step. Comprehensive continue is
 * server-locked, and adaptive grep does not need a long thought on a 35k
 * prompt just to emit the next tool call.
 */
export function chatThinkingLevel(
  policy: RetrievalPolicy
): "minimal" | "low" {
  switch (policy) {
    case "focused":
    case "adaptive":
    case "comprehensive":
      return "minimal";
    default: {
      const _exhaustive: never = policy;
      throw new Error(`Unhandled retrieval policy: ${String(_exhaustive)}`);
    }
  }
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
