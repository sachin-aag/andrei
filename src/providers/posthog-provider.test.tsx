// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import {
  PostHogProvider,
  startPostHogSessionRecording,
} from "./posthog-provider";

vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    startSessionRecording: vi.fn(),
  },
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("PostHogProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("inits with localStorage persistence", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    render(
      <PostHogProvider userId="user-1" email="a@b.com" name="Ada">
        <div />
      </PostHogProvider>
    );

    await waitFor(() => {
      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({
          persistence: "localStorage",
          cross_subdomain_cookie: false,
          disable_session_recording: true,
          api_host: "/mj-sync",
        })
      );
    });
    await waitFor(() => {
      expect(posthog.identify).toHaveBeenCalledWith("user-1", {
        email: "a@b.com",
        name: "Ada",
      });
    });
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  it("starts session recording only when the workspace asks", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    startPostHogSessionRecording();
    expect(posthog.startSessionRecording).toHaveBeenCalledWith(true);
  });

  it("does not init without a project key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    render(
      <PostHogProvider userId="user-1">
        <div />
      </PostHogProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });
});
