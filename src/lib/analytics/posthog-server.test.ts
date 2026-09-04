import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { PostHog } = vi.hoisted(() => {
  const PostHog = vi.fn(function PostHog() {
    return { captureImmediate: vi.fn(), captureExceptionImmediate: vi.fn() };
  });
  return { PostHog };
});

vi.mock("posthog-node", () => ({
  PostHog,
}));

import {
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
        flushInterval: 0,
      })
    );
    expect(getPostHogServer()).toBe(client);
  });

  it("returns null when the PostHog constructor throws", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    PostHog.mockImplementationOnce(() => {
      throw new Error("invalid key");
    });
    expect(getPostHogServer()).toBeNull();
  });
});
