import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const observe = vi.hoisted(() => vi.fn((fn: unknown) => fn));
const propagateAttributes = vi.hoisted(() =>
  vi.fn((_params: unknown, fn: () => unknown) => fn())
);
const updateActiveObservation = vi.hoisted(() => vi.fn());
const getActiveSpan = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/tracing", () => ({
  observe,
  propagateAttributes,
  updateActiveObservation,
}));

vi.mock("@opentelemetry/api", () => ({
  trace: { getActiveSpan },
}));

vi.mock("@/instrumentation", () => ({
  getLangfuseSpanProcessor: vi.fn(() => null),
}));

import {
  clipLangfuseAttribute,
  endActiveLangfuseObservation,
  isLangfuseEnabled,
  langfuseGenerateTextTelemetry,
  observationMetadata,
  observeRouteHandler,
  setRouteObservationIO,
  withPropagatedAttributes,
} from "@/lib/observability/langfuse";

describe("Langfuse v4 observation helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when keys are missing", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
    expect(isLangfuseEnabled()).toBe(false);
    expect(langfuseGenerateTextTelemetry({ functionId: "x" })).toEqual({});
  });

  it("stringifies and clips metadata to 200 characters", () => {
    const long = "a".repeat(250);
    expect(
      observationMetadata({
        count: 3,
        enabled: true,
        empty: "",
        skip: null,
        label: "ok",
        long,
      })
    ).toEqual({
      count: "3",
      enabled: "true",
      label: "ok",
      long: "a".repeat(200),
    });
    expect(clipLangfuseAttribute(long)).toHaveLength(200);
  });

  it("emits string-only AI SDK telemetry metadata when enabled", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    const telemetry = langfuseGenerateTextTelemetry({
      functionId: "criteria-evaluate-section",
      metadata: {
        criterionCount: 4,
        promptVersion: "v2",
      },
    });
    expect(telemetry).toEqual({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "criteria-evaluate-section",
        recordInputs: true,
        recordOutputs: true,
        metadata: {
          criterionCount: "4",
          promptVersion: "v2",
        },
      },
    });
  });

  it("propagates correlating attributes before the callback runs", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    const order: string[] = [];
    propagateAttributes.mockImplementation((_params, fn: () => unknown) => {
      order.push("propagate");
      return fn();
    });

    const result = withPropagatedAttributes(
      {
        sessionId: "session-1",
        userId: "user-1",
        traceName: "report-chat",
        tags: ["document-chat"],
        metadata: { reportId: "rpt-1", count: 2 },
      },
      () => {
        order.push("child");
        return "ok";
      }
    );

    expect(result).toBe("ok");
    expect(order).toEqual(["propagate", "child"]);
    expect(propagateAttributes).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        userId: "user-1",
        traceName: "report-chat",
        tags: ["document-chat"],
        metadata: { reportId: "rpt-1", count: "2" },
      },
      expect.any(Function)
    );
  });

  it("sets input/output on the active observation, not deprecated trace I/O", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    setRouteObservationIO({ input: { q: "hi" }, output: { a: "yo" } });
    expect(updateActiveObservation).toHaveBeenCalledWith({
      input: { q: "hi" },
      output: { a: "yo" },
    });
    expect(JSON.stringify(updateActiveObservation.mock.calls)).not.toContain(
      "setActiveTraceIO"
    );
  });

  it("wraps streaming handlers with endOnExit false", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    const handler = async () => "ok";
    observeRouteHandler("report-chat", handler, { endOnExit: false });
    expect(observe).toHaveBeenCalledWith(handler, {
      name: "report-chat",
      captureInput: false,
      captureOutput: false,
      endOnExit: false,
    });
  });

  it("ends the active root observation after a stream", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    const end = vi.fn();
    getActiveSpan.mockReturnValue({ end });
    endActiveLangfuseObservation();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
