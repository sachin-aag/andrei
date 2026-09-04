import { getPostHogServer } from "@/lib/analytics/posthog-server";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { formatChatLlmError } from "./assistant-turn";

/** Which chat product raised the failure. */
export type ChatFailureSurface = "report" | "analytics";

/** Where in the turn lifecycle the failure surfaced. */
export type ChatFailureSite =
  | "stream_start"
  | "stream_error"
  | "consume_timeout"
  | "empty_turn"
  | "client_error";

export type ChatFailureProperties = {
  surface: ChatFailureSurface;
  site: ChatFailureSite;
  reportId: string;
  sessionId: string;
  error: string;
  [key: string]: unknown;
};

export function chatFailureProperties(input: {
  surface: ChatFailureSurface;
  site: ChatFailureSite;
  reportId: string;
  sessionId: string;
  error: unknown;
  extra?: Record<string, unknown>;
}): ChatFailureProperties {
  return {
    surface: input.surface,
    site: input.site,
    reportId: input.reportId,
    sessionId: input.sessionId,
    error: formatChatLlmError(input.error),
    ...input.extra,
  };
}

function errorForException(error: unknown): unknown {
  return error instanceof Error ? error : new Error(formatChatLlmError(error));
}

/**
 * Report a server-side chat turn failure to PostHog (a countable event plus an
 * exception for error tracking). Best-effort: no-op without a PostHog key and
 * never throws, so it cannot mask the original failure. The distinct id is the
 * workspace user id, matching `posthog.identify` on the client.
 *
 * Callers should `await` this (or schedule it with Next `after()`) so the
 * serverless isolate does not freeze before the capture is sent.
 */
export async function captureChatAssistantFailure(input: {
  error: unknown;
  userId: string;
  reportId: string;
  sessionId: string;
  surface: ChatFailureSurface;
  site: ChatFailureSite;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    const posthog = getPostHogServer();
    if (!posthog) return;
    const properties = chatFailureProperties(input);
    await Promise.all([
      posthog.captureImmediate({
        distinctId: input.userId,
        event: "ai_chat_failed" satisfies AnalyticsEvent,
        properties,
      }),
      posthog.captureExceptionImmediate(
        errorForException(input.error),
        input.userId,
        properties
      ),
    ]);
  } catch {
    // Capture must never mask the original failure.
  }
}
