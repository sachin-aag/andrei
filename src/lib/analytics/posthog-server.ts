import { PostHog } from "posthog-node";
import { POSTHOG_EU_API_HOST } from "./posthog-config";

let posthogServer: PostHog | null | undefined;

function posthogKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return key || undefined;
}

export function isPostHogServerEnabled(): boolean {
  return Boolean(posthogKey());
}

export function getPostHogServer(): PostHog | null {
  if (!isPostHogServerEnabled()) return null;
  if (posthogServer === undefined) {
    posthogServer = new PostHog(posthogKey()!, {
      host: POSTHOG_EU_API_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogServer;
}

export function resetPostHogServerForTests(): void {
  posthogServer = undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Distinct id from the PostHog browser cookie, if the request still has one. */
export function distinctIdFromCookieHeader(
  cookieHeader: string | undefined,
  apiKey = posthogKey()
): string | undefined {
  if (!cookieHeader || !apiKey) return undefined;
  const match = cookieHeader.match(
    new RegExp(`ph_${escapeRegex(apiKey)}_posthog=([^;]+)`)
  );
  if (!match?.[1]) return undefined;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" && parsed.distinct_id
      ? parsed.distinct_id
      : undefined;
  } catch {
    return undefined;
  }
}
