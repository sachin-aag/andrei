import posthog from "posthog-js";

export type AnalyticsEvent =
  | "user_logged_in"
  | "report_created"
  | "report_submitted"
  | "report_approved"
  | "report_feedback_sent"
  | "report_exported"
  | "ai_evaluation_run"
  | "ai_suggestion_generated"
  | "ai_suggestion_accepted"
  | "ai_suggestion_dismissed"
  | "comment_created"
  | "comment_resolved"
  | "comment_dismissed"
  | "sidebar_tab_changed"
  | "expert_review_requested"
  | "ai_chat_failed";

export function captureEvent(
  event: AnalyticsEvent,
  props?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never break the product.
  }
}

export function captureClientException(
  error: unknown,
  props?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  try {
    posthog.captureException(error, props);
  } catch {
    // Analytics must never break the product.
  }
}
