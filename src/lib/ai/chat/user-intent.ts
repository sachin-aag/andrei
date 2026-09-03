/**
 * Latest-turn intent for Document and Analytics chat.
 *
 * Agent mode means the assistant *may* write when asked — not that empty
 * sections or ready attachments are a request to draft. Greetings must not
 * search or mutate.
 */

export const CHAT_USER_INTENTS = ["social", "read", "write"] as const;
export type ChatUserIntentKind = (typeof CHAT_USER_INTENTS)[number];

export type ChatUserIntentDecision = {
  kind: ChatUserIntentKind;
  reason: string;
};

export const DOCUMENT_WRITE_TOOLS = [
  "draft_field",
  "propose_edit",
  "edit_table",
  "insert_image",
  "remove_image",
  "plot_measurements",
  "select_analyze_method",
] as const;

export const ANALYTICS_WRITE_TOOLS = [
  "write_column",
  "manage_worksheet",
  "run_capability_sixpack",
  "run_one_way_anova",
  "plot_xy_scatter",
  "plot_boxplot",
  "plot_histogram",
  "plot_measurements",
] as const;

const GREETING_RE =
  /^(?:hi+|hello|hey+|yo|hiya|howdy|sup|what'?s up|whats up|good (?:morning|afternoon|evening|night))(?:\s+there)?(?:\s*[!.]*)?$/i;

const THANKS_RE =
  /^(?:thanks|thank you|thx|ty|cheers|appreciate it)(?:\s+(?:so much|a lot))?(?:\s*[!.]*)?$/i;

const SMALL_TALK_RE =
  /^(?:how are you(?: doing)?|what'?s going on|nice to meet you)(?:\s*[?.!]*)?$/i;

const CONFIRM_RE =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|k|go ahead|do it|please do|sounds good|yes please|please|go for it|do that|that works)(?:\s*[!.]*)?$/i;

/**
 * A confirmation that carries its own instruction ("yes put it in the data
 * worksheet"). `CONFIRM_RE` is anchored, so these fall through to the generic
 * matchers and the affirmation swallows the verb.
 */
const AFFIRMATION_PREFIX_RE =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|alright|absolutely|definitely|go ahead|do it|please do|sounds good|yes please|go for it|do that)\b[\s,.!:;–—-]*/i;

const WRITE_RE =
  /\b(?:draft|write(?:\s+(?:up|out|the))?|prepare|populate|fill(?:\s+(?:in|out|the))?|complete|do this section|edit|change|update|add|insert|remove|delete|rewrite|replace|fix|tighten|move|drop|append|propose|apply|redraft|put|place|paste|enter|load|import|save|start over|from scratch)\b/i;

const START_REPORT_RE =
  /\b(?:start|begin|kick ?off)\b.{0,48}\b(?:report|draft|document|writing|this)\b|\b(?:let'?s|please)\s+(?:start|begin|go)\b/i;

const CONTINUE_RE =
  /\b(?:keep going|continue|you missed|still missing|go on|finish (?:it|the (?:draft|report|section|review)))\b/i;

const POLITE_WRITE_RE =
  /\b(?:can you|could you|would you|please)\s+(?:draft|write|fill|prepare|populate|edit|add|insert|remove|delete|rewrite|replace|complete|plot|extract|run)\b/i;

/**
 * "Can you", "could you", "please" read as questions to `QUESTION_START_RE`
 * even when the verb after them is a write ("can you paste this into the
 * table"). Strip the opener and classify the instruction that follows.
 */
const POLITE_REQUEST_PREFIX_RE =
  /^(?:(?:can|could|would|will)\s+you\s+|please\s+)(?:please\s+|just\s+|go\s+ahead\s+and\s+|kindly\s+)*/i;

const ANALYTICS_WRITE_RE =
  /\b(?:extract|plot|graph|chart|sixpack|anova|capability|boxplot|scatter|histogram)\b/i;

/**
 * A worksheet destination is a write even when the verb is not in `WRITE_RE`
 * ("put it in the data worksheet", "stick those numbers into c3"). Lookups
 * phrased against the same nouns return earlier on `QUESTION_START_RE`.
 */
const ANALYTICS_DESTINATION_RE =
  /\b(?:in|into|onto|to)\s+(?:the\s+|a\s+|my\s+)?(?:\w+\s+){0,2}(?:worksheet|work sheet|spreadsheet|sheet|grid|column)s?\b/i;

const ADVICE_QUESTION_RE =
  /\b(?:how should i|what should i (?:write|draft|put|say|include)|which section should i|how do i (?:write|draft))\b/i;

const QUESTION_START_RE =
  /^(?:what|who|when|where|which|why|how|is|are|do|does|did|can|could|would|should|tell me|summar(?:y|ize)|explain|show|list|find|search|look)\b/i;

const ASSISTANT_WRITE_OFFER_RE =
  /\b(?:shall i|should i|want me to|would you like(?: me)? to|do you want me to|i can (?:draft|write|fill|extract|plot)|ready to draft|start drafting|i(?:'ll| will) draft)\b/i;

/** Skip-all on an Analytics page-number form — search, do not placeholder. */
const ASK_USER_ANSWERS_RE = /^Answers to your questions:/i;
const SKIPPED_PLACEHOLDER_RE = /\(skipped — use a placeholder\)/i;

/** Skip / "find it" after a page-number form — search, do not ask again. */
const ANALYTICS_FIND_IT_RE =
  /\b(?:find|look(?:\s+for)?|search(?:\s+for)?)\s+(?:it|that|this|the\s+page)\b/i;

export type ClassifyChatUserIntentInput = {
  userText: string;
  recentAssistantTexts?: readonly string[];
  /** Chat-attached photo/screenshot — look at it, do not treat as small talk. */
  hasChatImages?: boolean;
  surface?: "document" | "analytics";
  /**
   * Where the engineer is working. This is the strongest intent signal we
   * have: someone sitting in Agent mode is there to build the document, so
   * text that matches neither a question nor a write verb resolves to write
   * and keeps the edit tools loaded. Ask mode resolves the same text to read.
   */
  mode?: "plan" | "agent";
};

export function classifyChatUserIntent(
  input: ClassifyChatUserIntentInput
): ChatUserIntentDecision {
  const latest = input.userText.replace(/\s+/g, " ").trim();
  if (!latest) {
    if (input.hasChatImages) {
      return { kind: "read", reason: "chat_image" };
    }
    return { kind: "social", reason: "empty" };
  }

  if (GREETING_RE.test(latest) || THANKS_RE.test(latest) || SMALL_TALK_RE.test(latest)) {
    if (input.hasChatImages) {
      return { kind: "read", reason: "chat_image" };
    }
    return { kind: "social", reason: "greeting" };
  }

  if (
    input.surface === "analytics" &&
    ASK_USER_ANSWERS_RE.test(latest) &&
    SKIPPED_PLACEHOLDER_RE.test(latest)
  ) {
    return { kind: "write", reason: "skip_page_and_search" };
  }

  const offeredWrite = (input.recentAssistantTexts ?? []).some((text) =>
    ASSISTANT_WRITE_OFFER_RE.test(text)
  );

  if (CONFIRM_RE.test(latest)) {
    if (offeredWrite) {
      return { kind: "write", reason: "confirm_write_offer" };
    }
    return { kind: "social", reason: "ack_without_task" };
  }

  const affirmation = AFFIRMATION_PREFIX_RE.exec(latest);
  const task = affirmation ? latest.slice(affirmation[0].length).trim() : latest;
  if (affirmation && task) {
    if (offeredWrite) {
      return { kind: "write", reason: "confirm_write_offer" };
    }
  }

  return classifyTaskText(task || latest, input.surface, input.mode ?? "agent");
}

function classifyTaskText(
  text: string,
  surface: ClassifyChatUserIntentInput["surface"],
  mode: "plan" | "agent"
): ChatUserIntentDecision {
  if (CONTINUE_RE.test(text)) {
    return { kind: "write", reason: "continue_task" };
  }

  if (ADVICE_QUESTION_RE.test(text)) {
    return { kind: "read", reason: "writing_advice" };
  }

  if (POLITE_WRITE_RE.test(text) || START_REPORT_RE.test(text)) {
    return { kind: "write", reason: "produce_request" };
  }

  const polite = POLITE_REQUEST_PREFIX_RE.exec(text);
  const instruction = (polite ? text.slice(polite[0].length).trim() : text) || text;

  if (surface === "analytics" && ANALYTICS_FIND_IT_RE.test(instruction)) {
    return { kind: "write", reason: "locate_request" };
  }

  if (
    QUESTION_START_RE.test(instruction) &&
    !WRITE_RE.test(instruction.slice(0, 12))
  ) {
    return { kind: "read", reason: "question_or_lookup" };
  }

  if (
    WRITE_RE.test(instruction) ||
    (surface === "analytics" &&
      (ANALYTICS_WRITE_RE.test(instruction) ||
        ANALYTICS_DESTINATION_RE.test(instruction)))
  ) {
    return { kind: "write", reason: "produce_request" };
  }

  // Neither a question nor a recognized write verb. Fall back to where the
  // engineer is rather than to read: stripping the edit tools in Agent mode
  // is what made the assistant claim it could not write and paste a markdown
  // table into chat instead.
  if (mode === "agent") {
    return { kind: "write", reason: "ambiguous_agent_mode" };
  }
  return { kind: "read", reason: "question_or_lookup" };
}

export function recentAssistantMessageTexts(
  messages: ReadonlyArray<{ role: string; parts?: readonly unknown[] }>,
  limit = 2
): string[] {
  const texts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && texts.length < Math.max(1, limit); i--) {
    const message = messages[i];
    if (!message || message.role !== "assistant") continue;
    const text = textFromParts(message.parts).trim();
    if (text) texts.push(text);
  }
  return texts;
}

export function messageHasChatImage(
  parts: readonly unknown[] | undefined
): boolean {
  if (!parts) return false;
  return parts.some((part) => {
    if (typeof part !== "object" || part === null) return false;
    const type = (part as { type?: unknown }).type;
    if (typeof type !== "string") return false;
    return (
      type === "file" ||
      type === "image" ||
      type.startsWith("file-") ||
      type.startsWith("image-")
    );
  });
}

/**
 * Prompt copy for the tools `restrictToolsForIntent` just removed. Without it
 * the prompt still advertises the write tools and the model calls one that is
 * no longer loaded, which surfaces as `AI_NoSuchToolError` and a chat-only
 * markdown table instead of a written worksheet or section.
 */
export function intentToolAvailabilityRule(
  intent: ChatUserIntentKind,
  surface: "document" | "analytics"
): string | null {
  if (intent === "write") return null;
  const target = surface === "analytics" ? "worksheet or plot" : "document";
  if (intent === "social") {
    return `## Tools available this turn
None. This message is small talk — reply in one short sentence and call nothing.`;
  }
  const hidden = (
    surface === "analytics" ? ANALYTICS_WRITE_TOOLS : DOCUMENT_WRITE_TOOLS
  ).join(", ");
  return `## Tools available this turn
This message reads as a question, so the write tools (${hidden}) are not loaded. Do not call them — they will fail.
Answer from evidence. If they actually want you to change the ${target}, say so in one line and ask them to confirm; the tools return on that next message. Do not paste a draft, table, or worksheet block into chat as a stand-in for the edit, and do not tell them to switch modes.`;
}

export function restrictToolsForIntent<T extends Record<string, unknown>>(
  tools: T,
  intent: ChatUserIntentKind,
  surface: "document" | "analytics"
): T {
  if (intent === "write") return tools;
  if (intent === "social") return {} as T;
  const hide = new Set<string>(
    surface === "document" ? DOCUMENT_WRITE_TOOLS : ANALYTICS_WRITE_TOOLS
  );
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !hide.has(name))
  ) as T;
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
