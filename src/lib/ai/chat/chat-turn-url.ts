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
