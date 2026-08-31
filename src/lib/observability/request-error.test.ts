import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  captureExceptionImmediate,
  getPostHogServer,
  distinctIdFromCookieHeader,
  flushLangfuseTraces,
  isLangfuseEnabled,
  startSpan,
  getTracer,
} = vi.hoisted(() => {
  const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
  const getPostHogServer = vi.fn();
  const distinctIdFromCookieHeader = vi.fn();
  const flushLangfuseTraces = vi.fn().mockResolvedValue(undefined);
  const isLangfuseEnabled = vi.fn();
  const startSpan = vi.fn();
  const getTracer = vi.fn(() => ({ startSpan }));
  return {
    captureExceptionImmediate,
    getPostHogServer,
    distinctIdFromCookieHeader,
    flushLangfuseTraces,
    isLangfuseEnabled,
    startSpan,
    getTracer,
  };
});

vi.mock("@/lib/analytics/posthog-server", () => ({
  getPostHogServer,
  distinctIdFromCookieHeader,
}));

vi.mock("@/lib/observability/langfuse", () => ({
  flushLangfuseTraces,
  isLangfuseEnabled,
}));

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: { getTracer },
}));

import { reportRequestError } from "./request-error";

describe("reportRequestError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLangfuseEnabled.mockReturnValue(false);
    getPostHogServer.mockReturnValue(null);
    distinctIdFromCookieHeader.mockReturnValue("user-1");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when neither Langfuse nor PostHog is configured", async () => {
    await reportRequestError(new Error("boom"), { path: "/api/x", method: "GET" }, {});
    expect(captureExceptionImmediate).not.toHaveBeenCalled();
    expect(startSpan).not.toHaveBeenCalled();
  });

  it("captures the exception in PostHog with route metadata", async () => {
    getPostHogServer.mockReturnValue({ captureExceptionImmediate });
    const error = new Error("boom");
    await reportRequestError(
      error,
      {
        path: "/api/reports/abc",
        method: "POST",
        headers: { cookie: "ph_phc_test_posthog=%7B%7D" },
      },
      { routePath: "/api/reports/[reportId]", routeType: "route" }
    );
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      error,
      "user-1",
      expect.objectContaining({
        source: "nextjs.onRequestError",
        path: "/api/reports/abc",
        method: "POST",
        routePath: "/api/reports/[reportId]",
      })
    );
  });

  it("records a Langfuse/OTEL error span when tracing is on", async () => {
    isLangfuseEnabled.mockReturnValue(true);
    const span = {
      setStatus: vi.fn(),
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };
    startSpan.mockReturnValue(span);
    const error = new Error("eval exploded");
    await reportRequestError(
      error,
      { path: "/api/reports/1/evaluate", method: "POST" },
      { routeType: "route" }
    );
    expect(startSpan).toHaveBeenCalledWith("nextjs.request_error");
    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.end).toHaveBeenCalled();
    expect(flushLangfuseTraces).toHaveBeenCalled();
  });

  it("swallows reporter failures", async () => {
    getPostHogServer.mockReturnValue({
      captureExceptionImmediate: vi.fn().mockRejectedValue(new Error("posthog down")),
    });
    await expect(
      reportRequestError(new Error("boom"), { path: "/" }, {})
    ).resolves.toBeUndefined();
  });
});
