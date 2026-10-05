"use client";

import {
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
} from "@/lib/analytics/posthog-config";
import { expirePostHogCookiesInBrowser } from "@/lib/analytics/posthog-cookies";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

function posthogKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return key || undefined;
}

export function PostHogProvider({
  children,
  userId,
  email,
  name,
}: {
  children: React.ReactNode;
  userId?: string;
  email?: string | null;
  name?: string | null;
}) {
  useEffect(() => {
    const key = posthogKey();
    if (!key) return;
    expirePostHogCookiesInBrowser();
    posthog.init(key, {
      api_host: POSTHOG_PROXY_PATH,
      ui_host: POSTHOG_UI_HOST,
      person_profiles: "identified_only",
      // Default is localStorage+cookie; feature-flag payloads in cookies stall
      // /edit (Cookie header on every RSC + Edge proxy). Identity stays in
      // localStorage. Existing ph_* cookies are expired above and in proxy.ts.
      persistence: "localStorage",
      cross_subdomain_cookie: false,
    });
  }, []);

  useEffect(() => {
    if (!userId || !posthogKey()) return;

    posthog.identify(userId, {
      email: email ?? undefined,
      name: name ?? undefined,
    });
    // Recorder v2 lazy-loads by default; start explicitly once identified so
    // report editing is captured (not just a hollow shell on pageleave).
    posthog.startSessionRecording(true);
  }, [userId, email, name]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
