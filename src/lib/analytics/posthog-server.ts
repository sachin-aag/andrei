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

/** Test helper — the module singleton otherwise leaks across cases. */
export function resetPostHogServerForTests(): void {
  posthogServer = undefined;
}

/** Shared server-side PostHog client, or null when no key is configured. */
export function getPostHogServer(): PostHog | null {
  if (!isPostHogServerEnabled()) return null;
  if (posthogServer === undefined) {
    try {
      posthogServer = new PostHog(posthogKey()!, {
        host: POSTHOG_EU_API_HOST,
        flushAt: 1,
        flushInterval: 0,
      });
    } catch {
      posthogServer = null;
    }
  }
  return posthogServer;
}
