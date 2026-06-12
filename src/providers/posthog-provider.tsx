"use client";

import {
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
} from "@/lib/analytics/posthog-config";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

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
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: POSTHOG_PROXY_PATH,
      ui_host: POSTHOG_UI_HOST,
      person_profiles: "identified_only",
    });
  }, []);

  useEffect(() => {
    if (userId) {
      posthog.identify(userId, {
        email: email ?? undefined,
        name: name ?? undefined,
      });
    }
  }, [userId, email, name]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
