import { afterEach, describe, expect, it, vi } from "vitest";

const getPostHogServer = vi.fn();

vi.mock("@/lib/analytics/posthog-server", () => ({
  getPostHogServer: () => getPostHogServer(),
}));

import { captureChatAssistantFailure } from "./chat-failure-telemetry";

afterEach(() => {
  vi.clearAllMocks();
});

describe("captureChatAssistantFailure", () => {
  it("no-ops when PostHog is not configured", async () => {
    getPostHogServer.mockReturnValue(null);
    await expect(
      captureChatAssistantFailure({
        error: new Error("boom"),
        userId: "user-1",
        reportId: "report-1",
        sessionId: "session-1",
        surface: "report",
        site: "stream_error",
      })
    ).resolves.toBeUndefined();
  });

  it("captures a countable event and an exception for the workspace user", async () => {
    const captureImmediate = vi.fn().mockResolvedValue(undefined);
    const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({
      captureImmediate,
      captureExceptionImmediate,
    });
    const error = new Error("gateway timeout");

    await captureChatAssistantFailure({
      error,
      userId: "user-1",
      reportId: "report-1",
      sessionId: "session-1",
      surface: "analytics",
      site: "stream_start",
    });

    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "ai_chat_failed",
      properties: {
        surface: "analytics",
        site: "stream_start",
        reportId: "report-1",
        sessionId: "session-1",
        error: "Error: gateway timeout",
      },
    });
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      error,
      "user-1",
      expect.objectContaining({ surface: "analytics", site: "stream_start" })
    );
  });

  it("forwards extra properties such as finishReason", async () => {
    const captureImmediate = vi.fn().mockResolvedValue(undefined);
    const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({
      captureImmediate,
      captureExceptionImmediate,
    });

    await captureChatAssistantFailure({
      error: new Error("empty"),
      userId: "user-1",
      reportId: "report-1",
      sessionId: "session-1",
      surface: "report",
      site: "empty_turn",
      extra: { finishReason: "error" },
    });

    expect(captureImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          site: "empty_turn",
          finishReason: "error",
        }),
      })
    );
  });

  it("swallows PostHog client failures so capture cannot mask the original error", async () => {
    getPostHogServer.mockImplementation(() => {
      throw new Error("posthog down");
    });
    await expect(
      captureChatAssistantFailure({
        error: new Error("boom"),
        userId: "user-1",
        reportId: "report-1",
        sessionId: "session-1",
        surface: "report",
        site: "consume_timeout",
      })
    ).resolves.toBeUndefined();
  });

  it("swallows rejected capture promises", async () => {
    getPostHogServer.mockReturnValue({
      captureImmediate: vi.fn().mockRejectedValue(new Error("network")),
      captureExceptionImmediate: vi
        .fn()
        .mockRejectedValue(new Error("network")),
    });
    await expect(
      captureChatAssistantFailure({
        error: new Error("boom"),
        userId: "user-1",
        reportId: "report-1",
        sessionId: "session-1",
        surface: "report",
        site: "stream_error",
      })
    ).resolves.toBeUndefined();
  });
});
