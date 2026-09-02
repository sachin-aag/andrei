/**
 * Which work-product a chat turn was sent to. Mixed Report + Analytics turns
 * can share one session; this tag is how history stays readable.
 *
 * Persisted on `chat_messages.metadata.chatTarget`. The route that handled
 * the POST stamps it — do not trust a client body field for storage.
 */

export const CHAT_MESSAGE_TARGETS = ["report", "analytics"] as const;
export type ChatMessageTarget = (typeof CHAT_MESSAGE_TARGETS)[number];

export function isChatMessageTarget(
  value: unknown
): value is ChatMessageTarget {
  return value === "report" || value === "analytics";
}

export function chatUserTurnMetadata(chatTarget: ChatMessageTarget): {
  chatTarget: ChatMessageTarget;
} {
  return { chatTarget };
}

export function chatMessageTargetLabel(target: ChatMessageTarget): string {
  switch (target) {
    case "report":
      return "Report";
    case "analytics":
      return "Analytics";
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/**
 * Worksheet / plot tools that exist only on `/analytics/chat`. Shared tools
 * (`search_documents`, `plot_measurements`, `ask_user`, page/outline reads)
 * must not vote — they appear on both surfaces.
 */
const ANALYTICS_ONLY_TOOLS = new Set([
  "write_column",
  "manage_worksheet",
  "read_worksheet",
  "run_capability_sixpack",
  "run_one_way_anova",
  "plot_xy_scatter",
  "plot_boxplot",
  "plot_histogram",
  "extract_numeric_series",
  "scan_attachments",
]);

/** Document-drafting tools that exist only on `/chat`. */
const REPORT_ONLY_TOOLS = new Set([
  "propose_edit",
  "draft_field",
  "read_section",
  "edit_table",
  "insert_image",
  "remove_image",
  "select_analyze_method",
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
]);

function toolNamesFromParts(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];
  const names: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const rec = part as { type?: unknown; toolName?: unknown };
    if (typeof rec.toolName === "string" && rec.toolName.trim()) {
      names.push(rec.toolName);
      continue;
    }
    if (typeof rec.type === "string" && rec.type.startsWith("tool-")) {
      const name = rec.type.slice("tool-".length);
      if (name) names.push(name);
    }
  }
  return names;
}

export function chatMessageTargetFromParts(
  parts: unknown
): ChatMessageTarget | null {
  const names = toolNamesFromParts(parts);
  let sawReport = false;
  let sawAnalytics = false;
  for (const name of names) {
    if (REPORT_ONLY_TOOLS.has(name)) sawReport = true;
    if (ANALYTICS_ONLY_TOOLS.has(name)) sawAnalytics = true;
  }
  if (sawReport && !sawAnalytics) return "report";
  if (sawAnalytics && !sawReport) return "analytics";
  return null;
}

/**
 * Prefer the stamped `chatTarget`. Legacy assistant rows already store
 * `promptVersion` (`chat-v*` vs `analytics-chat-v*`).
 */
export function chatMessageTargetFromMetadata(
  metadata: unknown
): ChatMessageTarget | null {
  if (!metadata || typeof metadata !== "object") return null;
  const rec = metadata as Record<string, unknown>;
  if (isChatMessageTarget(rec.chatTarget)) return rec.chatTarget;
  if (typeof rec.promptVersion === "string") {
    if (rec.promptVersion.startsWith("analytics-chat-")) return "analytics";
    if (rec.promptVersion.startsWith("chat-")) return "report";
  }
  return null;
}

export type ChatMessageTargetSource = {
  role?: string;
  parts?: unknown;
  metadata?: unknown;
};

/**
 * Resolve a Report / Analytics tag for each turn in a mixed thread.
 *
 * 1. `metadata.chatTarget` or legacy `promptVersion`
 * 2. Exclusive tool names on the parts
 * 3. Untagged user rows inherit the following assistant's tag
 * 4. The in-flight turn (last user + trailing assistant) uses `inFlightTarget`
 * 5. Remaining gaps inherit the previous tagged turn
 * 6. Fully unknown legacy stays untagged — never invent a label
 */
export function tagChatMessages<T extends ChatMessageTargetSource>(
  messages: T[],
  opts?: { inFlightTarget?: ChatMessageTarget | null }
): Array<T & { chatTarget: ChatMessageTarget | null }> {
  const resolved = messages.map((message) => ({
    ...message,
    chatTarget:
      chatMessageTargetFromMetadata(message.metadata) ??
      chatMessageTargetFromParts(message.parts),
  }));

  for (let i = 0; i < resolved.length; i++) {
    const current = resolved[i]!;
    if (current.chatTarget || current.role !== "user") continue;
    const next = resolved[i + 1];
    if (next?.role === "assistant" && next.chatTarget) {
      current.chatTarget = next.chatTarget;
    }
  }

  const inFlightTarget = opts?.inFlightTarget ?? null;
  if (inFlightTarget) {
    let lastUser = -1;
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i]!.role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser >= 0) {
      for (let i = lastUser; i < resolved.length; i++) {
        if (!resolved[i]!.chatTarget) {
          resolved[i]!.chatTarget = inFlightTarget;
        }
      }
    } else {
      const last = resolved[resolved.length - 1];
      if (last && !last.chatTarget) last.chatTarget = inFlightTarget;
    }
  }

  let prev: ChatMessageTarget | null = null;
  for (const message of resolved) {
    if (message.chatTarget) {
      prev = message.chatTarget;
    } else if (prev) {
      message.chatTarget = prev;
    }
  }

  return resolved;
}
