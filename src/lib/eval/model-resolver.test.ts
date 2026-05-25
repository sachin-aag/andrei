import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_PROVIDERS,
  resolveVertexAnthropicLocation,
  resolveVertexGeminiLocation,
  resolveModelFromSpec,
} from "@/lib/eval/model-resolver";

describe("resolveVertexGeminiLocation", () => {
  afterEach(() => {
    delete process.env.GOOGLE_VERTEX_LOCATION;
  });

  it("prefers explicit override", () => {
    expect(resolveVertexGeminiLocation("europe-west1")).toBe("europe-west1");
  });

  it("falls back to env then us-central1", () => {
    process.env.GOOGLE_VERTEX_LOCATION = "us-west1";
    expect(resolveVertexGeminiLocation()).toBe("us-west1");
    delete process.env.GOOGLE_VERTEX_LOCATION;
    expect(resolveVertexGeminiLocation()).toBe("us-central1");
  });
});

describe("resolveVertexAnthropicLocation", () => {
  afterEach(() => {
    delete process.env.GOOGLE_VERTEX_LOCATION;
    delete process.env.GOOGLE_VERTEX_ANTHROPIC_LOCATION;
  });

  it("prefers anthropic-specific env", () => {
    process.env.GOOGLE_VERTEX_ANTHROPIC_LOCATION = "us-east5";
    expect(resolveVertexAnthropicLocation()).toBe("us-east5");
  });

  it("falls back to us-east5", () => {
    expect(resolveVertexAnthropicLocation()).toBe("us-east5");
  });
});

describe("resolveModelFromSpec", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_VERTEX_PROJECT;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it("requires GOOGLE_VERTEX_PROJECT for vertex gemini", () => {
    expect(() =>
      resolveModelFromSpec({
        provider: "vertex",
        modelId: "gemini-3.1-flash",
        temperature: 0,
      })
    ).toThrow(/GOOGLE_VERTEX_PROJECT/);
  });

  it("requires GOOGLE_VERTEX_PROJECT for vertex anthropic", () => {
    expect(() =>
      resolveModelFromSpec({
        provider: "vertex-anthropic",
        modelId: "claude-sonnet-4@20250514",
        temperature: 0,
      })
    ).toThrow(/GOOGLE_VERTEX_PROJECT/);
  });
});

describe("MODEL_PROVIDERS", () => {
  it("includes vertex gemini and vertex anthropic", () => {
    expect(MODEL_PROVIDERS).toContain("vertex");
    expect(MODEL_PROVIDERS).toContain("vertex-anthropic");
  });
});
