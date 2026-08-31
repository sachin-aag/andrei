import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Langfuse span processor v4 ingestion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@langfuse/otel");
    vi.doUnmock("@opentelemetry/sdk-trace-node");
  });

  it("does not construct a processor when keys are missing", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
    const ctor = vi.fn();
    vi.doMock("@langfuse/otel", () => ({ LangfuseSpanProcessor: ctor }));
    vi.doMock("@opentelemetry/sdk-trace-node", () => ({
      NodeTracerProvider: vi.fn(),
    }));
    const { getLangfuseSpanProcessor } = await import("@/instrumentation");
    expect(getLangfuseSpanProcessor()).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });

  it("sends immediate export and the v4 ingestion header", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    vi.stubEnv("LANGFUSE_HOST", "https://langfuse.example.test");
    const ctor = vi.fn(() => ({ forceFlush: vi.fn() }));
    vi.doMock("@langfuse/otel", () => ({ LangfuseSpanProcessor: ctor }));
    vi.doMock("@opentelemetry/sdk-trace-node", () => ({
      NodeTracerProvider: vi.fn(),
    }));
    const { getLangfuseSpanProcessor } = await import("@/instrumentation");
    const processor = getLangfuseSpanProcessor();
    expect(processor).not.toBeNull();
    expect(ctor).toHaveBeenCalledWith({
      baseUrl: "https://langfuse.example.test",
      exportMode: "immediate",
      additionalHeaders: {
        "x-langfuse-ingestion-version": "4",
      },
    });
  });

  it("prefers LANGFUSE_BASE_URL over LANGFUSE_HOST", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    vi.stubEnv("LANGFUSE_BASE_URL", "https://example.langfuse.internal");
    vi.stubEnv("LANGFUSE_HOST", "https://langfuse.example.test");
    const ctor = vi.fn(() => ({ forceFlush: vi.fn() }));
    vi.doMock("@langfuse/otel", () => ({ LangfuseSpanProcessor: ctor }));
    vi.doMock("@opentelemetry/sdk-trace-node", () => ({
      NodeTracerProvider: vi.fn(),
    }));
    const { getLangfuseSpanProcessor } = await import("@/instrumentation");
    getLangfuseSpanProcessor();
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.langfuse.internal",
      })
    );
  });
});
