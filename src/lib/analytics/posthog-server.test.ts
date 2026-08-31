import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { PostHog } = vi.hoisted(() => {
  const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
  const PostHog = vi.fn(function PostHog() {
    return { captureExceptionImmediate };
  });
  return { PostHog };
});

vi.mock("posthog-node", () => ({
  PostHog,
}));

import {
  distinctIdFromCookieHeader,
  getPostHogServer,
  isPostHogServerEnabled,
  resetPostHogServerForTests,
} from "./posthog-server";

describe("posthog-server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetPostHogServerForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPostHogServerForTests();
  });

  it("is disabled without a project key", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(isPostHogServerEnabled()).toBe(false);
    expect(getPostHogServer()).toBeNull();
    expect(PostHog).not.toHaveBeenCalled();
  });

  it("constructs a EU-hosted client when the key is set", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const client = getPostHogServer();
    expect(client).not.toBeNull();
    expect(PostHog).toHaveBeenCalledTimes(1);
    expect(PostHog).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        host: "https://eu.i.posthog.com",
        flushAt: 1,
      })
    );
    expect(getPostHogServer()).toBe(client);
  });

  it("reads distinct_id from the PostHog cookie", () => {
    const cookie = `ph_phc_test_posthog=${encodeURIComponent(
      JSON.stringify({ distinct_id: "user-1" })
    )}`;
    expect(distinctIdFromCookieHeader(cookie, "phc_test")).toBe("user-1");
    expect(distinctIdFromCookieHeader("other=1", "phc_test")).toBeUndefined();
  });
});
