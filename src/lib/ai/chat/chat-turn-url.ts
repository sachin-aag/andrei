import { isWorkProductView, type WorkProductView } from "@/components/report/workspace-chrome";

export function reportChatApi(reportId: string): string {
  return `/api/reports/${reportId}/chat`;
}

export function analyticsChatApi(reportId: string): string {
  return `/api/reports/${reportId}/analytics/chat`;
}

export function parseChatTargetFromBody(body: unknown): WorkProductView | null {
  if (typeof body !== "object" || body === null) return null;
  const target = (body as { chatTarget?: unknown }).chatTarget;
  return isWorkProductView(target) ? target : null;
}

/**
 * Report vs Analytics for failure telemetry. Both products share one
 * `useChat` host on `/api/reports/:id/chat`; Analytics turns are routed by
 * `chatTarget` in the POST body (and copied onto the user-message metadata).
 * Do not infer the surface from the host `api` path.
 */
export function chatFailureSurfaceFromSend(input: {
  body?: unknown;
  metadata?: unknown;
}): WorkProductView {
  return (
    parseChatTargetFromBody(input.body) ??
    parseChatTargetFromBody(input.metadata) ??
    "report"
  );
}

/** Send analytics-targeted turns to the stats assistant; everything else stays on report chat. */
export function resolveChatTurnUrl(
  reportId: string,
  defaultUrl: string,
  body: unknown
): string {
  return parseChatTargetFromBody(body) === "analytics"
    ? analyticsChatApi(reportId)
    : defaultUrl;
}

export function readJsonBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string") return null;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return null;
  }
}
