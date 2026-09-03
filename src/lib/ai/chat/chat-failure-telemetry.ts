import { getPostHogServer } from "@/lib/analytics/posthog-server";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { formatChatLlmError } from "./assistant-turn";

/** Which chat product raised the failure. */
export type ChatFailureSurface = "report" | "analytics";

/** Where in the turn lifecycle the failure surfaced. */
export type ChatFailureSite = "stream_start" | "stream_error";

/**
 * Report a server-side chat turn failure to PostHog (a countable event plus an
 * exception for error tracking). Best-effort: no-op without a PostHog key and
 * never throws, so it cannot mask the original failure. The distinct id is the
 * workspace user id, matching `posthog.identify` on the client.
 */
export function captureChatAssistantFailure(input: {
  error: unknown;
  userId: string;
  reportId: string;
  sessionId: string;
  surface: ChatFailureSurface;
  site: ChatFailureSite;
}): void {
  const posthog = getPostHogServer();
  if (!posthog) return;
  const properties = {
    surface: input.surface,
    site: input.site,
    reportId: input.reportId,
    sessionId: input.sessionId,
    error: formatChatLlmError(input.error),
  };
  void posthog
    .captureImmediate({
      distinctId: input.userId,
      event: "ai_chat_failed" satisfies AnalyticsEvent,
      properties,
    })
    .catch(() => {});
  void posthog
    .captureExceptionImmediate(input.error, input.userId, properties)
    .catch(() => {});
}
