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
  | "sidebar_tab_changed";

export function captureEvent(
  event: AnalyticsEvent,
  props?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  posthog.capture(event, props);
}
