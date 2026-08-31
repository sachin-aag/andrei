import type { UIMessage } from "ai";

/** User-facing copy when a chat turn fails or the model returns nothing visible. */
export const CHAT_ASSISTANT_ERROR_MESSAGE =
  "The assistant hit an error. Please try again.";

/** User-facing copy when the stream is cancelled or hits the deadline. */
export const CHAT_ASSISTANT_INTERRUPTED_MESSAGE =
  "The assistant stopped before finishing. Please try again.";

/** Vercel `maxDuration` for the chat route, in seconds. */
export const CHAT_FUNCTION_MAX_DURATION_SEC = 300;

/** Must stay below `CHAT_FUNCTION_MAX_DURATION_SEC` so persist can run. */
export const CHAT_SERVER_ABORT_MS = 270_000;

/**
 * Bound `consumeStream()` so Next `after()` can still `clearAssistantTurn`
 * before Vercel kills the isolate. The SDK timeout does not always stop
 * consume after a tool-call parse error.
 */
export const CHAT_CONSUME_STREAM_BUDGET_MS = CHAT_SERVER_ABORT_MS + 15_000;

/** Show a still-working hint after this long with no new visible part. */
export const CHAT_CLIENT_STALE_MS = 25_000;

/**
 * Client backup if the SSE never closes after the server deadline.
 * After the server abort, before Vercel kills the isolate.
 */
export const CHAT_CLIENT_GIVE_UP_MS = 280_000;

type ChatTurnPart = {
  type?: string;
  text?: unknown;
  state?: unknown;
};

/**
 * True when the assistant turn would render something in the chat panel.
 * Reasoning parts render as collapsible Thought lines when streamed
 * (`sendReasoning: true`). Tool chips and prose also count as visible.
 */
export function assistantPartsHaveVisibleContent(
  parts: readonly ChatTurnPart[] | null | undefined
): boolean {
  if (!parts || parts.length === 0) return false;
  for (const part of parts) {
    if (!part || typeof part.type !== "string") continue;
    if (part.type === "text") {
      if (typeof part.text === "string" && part.text.trim()) return true;
      continue;
    }
    if (part.type === "reasoning") {
      const text = typeof part.text === "string" ? part.text.trim() : "";
      if (text) return true;
      continue;
    }
    if (part.type === "file" || part.type.startsWith("tool-")) return true;
  }
  return false;
}

/** True when the engineer would see written prose (not only tool chips). */
export function assistantPartsHaveVisibleText(
  parts: readonly ChatTurnPart[] | null | undefined
): boolean {
  if (!parts || parts.length === 0) return false;
  return parts.some((part) => partHasVisibleText(part));
}

/** Finish reasons that mean the model did not complete a usable reply. */
export function isFailedChatFinishReason(
  finishReason: string | undefined
): boolean {
  return finishReason === "error" || finishReason === "content-filter";
}

export function shouldShowEmptyAssistantError(options: {
  parts: readonly ChatTurnPart[] | null | undefined;
  streaming: boolean;
}): boolean {
  if (options.streaming) return false;
  return !assistantPartsHaveVisibleContent(options.parts);
}

/**
 * Fingerprint of what the user can see so the client watchdog can tell
 * "still thinking" from "tools / text just arrived".
 */
export function assistantProgressSignature(
  parts: readonly ChatTurnPart[] | null | undefined
): string {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((part) => {
      if (!part || typeof part.type !== "string") return "";
      if (part.type === "text") {
        const text = typeof part.text === "string" ? part.text : "";
        return `text:${text.length}`;
      }
      if (part.type === "reasoning") {
        const text = typeof part.text === "string" ? part.text : "";
        const state = typeof part.state === "string" ? part.state : "";
        return `reasoning:${text.length}:${state}`;
      }
      if (part.type.startsWith("tool-")) {
        const state = typeof part.state === "string" ? part.state : "";
        return `${part.type}:${state}`;
      }
      return part.type;
    })
    .join("|");
}

export type ChatWatchdogPhase = "hidden" | "stale" | "give_up";

export function chatWatchdogPhase(input: {
  busy: boolean;
  elapsedMs: number;
  silentMs: number;
}): ChatWatchdogPhase {
  if (!input.busy) return "hidden";
  if (input.elapsedMs >= CHAT_CLIENT_GIVE_UP_MS) return "give_up";
  if (input.silentMs >= CHAT_CLIENT_STALE_MS) return "stale";
  return "hidden";
}

function partHasVisibleText(part: ChatTurnPart | undefined): boolean {
  return (
    part?.type === "text" &&
    typeof part.text === "string" &&
    Boolean(part.text.trim())
  );
}

function appendNoticeIfMissing(
  parts: UIMessage["parts"],
  notice: string
): UIMessage["parts"] {
  const last = parts[parts.length - 1];
  if (
    last &&
    last.type === "text" &&
    "text" in last &&
    typeof last.text === "string" &&
    last.text.includes(notice)
  ) {
    return parts;
  }
  return [...parts, { type: "text", text: notice }];
}

function appendInterruptedNotice(parts: UIMessage["parts"]): UIMessage["parts"] {
  return appendNoticeIfMissing(parts, CHAT_ASSISTANT_INTERRUPTED_MESSAGE);
}

/**
 * Persist a user-visible assistant row when the stream finishes empty, or
 * when it is aborted (explicit Cancel / deadline) so history is not an
 * orphaned user turn. Tab close no longer aborts the server turn.
 * A `tool-calls` stop with only tool chips is logged as incomplete — do
 * not append a “continue / re-prompt” notice. There is no tool-step cap.
 */
export function partsForPersistedAssistantTurn(options: {
  parts: UIMessage["parts"] | undefined;
  isAborted: boolean;
  finishReason?: string;
}): {
  parts: UIMessage["parts"];
  emptyFailure: boolean;
  interrupted: boolean;
  incomplete: boolean;
} {
  const parts = options.parts ?? [];
  const visible = assistantPartsHaveVisibleContent(parts);
  const hasVisibleText = parts.some((part) => partHasVisibleText(part));

  if (options.isAborted) {
    if (hasVisibleText) {
      return {
        parts,
        emptyFailure: false,
        interrupted: false,
        incomplete: false,
      };
    }
    if (visible) {
      return {
        parts: appendInterruptedNotice(parts),
        emptyFailure: false,
        interrupted: true,
        incomplete: true,
      };
    }
    return {
      parts: INTERRUPTED_ASSISTANT_PARTS,
      emptyFailure: true,
      interrupted: true,
      incomplete: true,
    };
  }

  if (options.finishReason === "tool-calls" && !hasVisibleText && visible) {
    return {
      parts,
      emptyFailure: false,
      interrupted: false,
      incomplete: true,
    };
  }

  if (visible) {
    return {
      parts,
      emptyFailure: false,
      interrupted: false,
      incomplete: false,
    };
  }
  return {
    parts: EMPTY_ASSISTANT_ERROR_PARTS,
    emptyFailure: true,
    interrupted: false,
    incomplete: false,
  };
}

export function formatChatLlmError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name?.trim() || "Error";
    const message = error.message?.trim() || "unknown error";
    return `${name}: ${message}`;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

/**
 * Wait for the SDK stream to drain, but never past the isolate budget.
 * A hung consume after `NoSuchToolError` used to pin `after()` until
 * Vercel killed the function, so `onFinish` never cleared the turn.
 */
export async function consumeAssistantStreamWithBudget(
  consume: () => PromiseLike<void>,
  budgetMs = CHAT_CONSUME_STREAM_BUDGET_MS
): Promise<"completed" | "timed_out"> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const consumePromise = Promise.resolve(consume()).then(
    () => "completed" as const
  );
  try {
    const outcome = await Promise.race([
      consumePromise,
      new Promise<"timed_out">((resolve) => {
        timeoutId = setTimeout(() => resolve("timed_out"), budgetMs);
      }),
    ]);
    if (outcome === "timed_out") {
      void consumePromise.catch(() => undefined);
    }
    return outcome;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

const EMPTY_ASSISTANT_ERROR_PARTS: UIMessage["parts"] = [
  { type: "text", text: CHAT_ASSISTANT_ERROR_MESSAGE },
];

const INTERRUPTED_ASSISTANT_PARTS: UIMessage["parts"] = [
  { type: "text", text: CHAT_ASSISTANT_INTERRUPTED_MESSAGE },
];
