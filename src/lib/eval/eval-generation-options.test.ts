import { describe, expect, it } from "vitest";
import {
  buildEvalGenerationSettings,
  formatModelRunLabel,
  parseEvalEffort,
} from "@/lib/eval/eval-generation-options";

describe("parseEvalEffort", () => {
  it("accepts known effort levels", () => {
    expect(parseEvalEffort("high")).toBe("high");
    expect(parseEvalEffort("none")).toBe("none");
  });

  it("rejects unknown values", () => {
    expect(() => parseEvalEffort("turbo")).toThrow(/Invalid effort/);
  });
});

describe("formatModelRunLabel", () => {
  it("includes effort and temperature when non-default", () => {
    expect(
      formatModelRunLabel({
        provider: "google",
        modelId: "gemini-3.1-flash",
        temperature: 0.2,
        effort: "high",
      })
    ).toBe("google/gemini-3.1-flash@temp=0.2@effort=high");
  });

  it("omits default temperature and effort", () => {
    expect(
      formatModelRunLabel({
        provider: "google",
        modelId: "gemini-3.1-flash-lite",
        temperature: 0,
        effort: "none",
      })
    ).toBe("google/gemini-3.1-flash-lite");
  });
});

describe("buildEvalGenerationSettings", () => {
  it("maps effort to google thinkingLevel with thoughts disabled", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "google",
        temperature: 0,
        seed: 0,
        effort: "low",
      })
    ).toMatchObject({
      temperature: 0,
      providerOptions: {
        google: {
          seed: 0,
          thinkingConfig: {
            thinkingLevel: "low",
            includeThoughts: false,
          },
        },
      },
    });
  });

  it("omits thinking config when effort is none", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "google",
        temperature: 0,
        seed: 0,
        effort: "none",
      })
    ).toEqual({
      temperature: 0,
      maxOutputTokens: 32768,
      providerOptions: {
        google: { seed: 0 },
      },
    });
  });

  it("maps effort to openai reasoningEffort", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "openai",
        temperature: 0,
        effort: "minimal",
      }).providerOptions
    ).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });

  it("uses vertex provider key for thinking config", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "vertex",
        temperature: 0,
        effort: "medium",
      }).providerOptions
    ).toEqual({
      vertex: {
        thinkingConfig: {
          thinkingLevel: "medium",
          includeThoughts: false,
        },
      },
    });
  });

  it("omits temperature for Vertex Anthropic", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "vertex-anthropic",
        modelId: "claude-opus-4-7",
        temperature: 0,
        effort: "none",
      })
    ).toEqual({
      maxOutputTokens: 32768,
    });
  });

  it("omits temperature and seed for OpenAI reasoning models", () => {
    expect(
      buildEvalGenerationSettings({
        providerHint: "openai",
        modelId: "gpt-5.5",
        temperature: 0,
        seed: 0,
        effort: "none",
      })
    ).toEqual({
      maxOutputTokens: 32768,
    });
  });
});
