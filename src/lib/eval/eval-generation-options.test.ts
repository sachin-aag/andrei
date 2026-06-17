import { describe, expect, it } from "vitest";
import {
  buildEvalGenerationSettings,
  buildGeminiThoughtSummaryProviderOptions,
} from "./eval-generation-options";

describe("eval generation options", () => {
  it("adds minimal Gemini thought summaries for criteria evaluation traces", () => {
    const settings = buildEvalGenerationSettings({
      temperature: 0,
      seed: 0,
      effort: "none",
      traceGeminiThoughts: true,
      defaultGeminiThinkingLevel: "minimal",
    });

    expect(settings).toMatchObject({
      temperature: 0,
      maxOutputTokens: 32768,
      providerOptions: {
        google: {
          seed: 0,
          thinkingConfig: {
            thinkingLevel: "minimal",
            includeThoughts: true,
          },
        },
        vertex: {
          seed: 0,
          thinkingConfig: {
            thinkingLevel: "minimal",
            includeThoughts: true,
          },
        },
      },
    });
  });

  it("adds high Gemini thought summaries for suggestion generation traces", () => {
    expect(
      buildGeminiThoughtSummaryProviderOptions({
        thinkingLevel: "high",
      })
    ).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: true,
        },
      },
      vertex: {
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: true,
        },
      },
    });
  });

  it("keeps existing non-reasoning eval settings unchanged by default", () => {
    const settings = buildEvalGenerationSettings({
      temperature: 0,
      seed: 0,
      effort: "none",
    });

    expect(settings).toMatchObject({
      temperature: 0,
      maxOutputTokens: 32768,
      providerOptions: {
        google: {
          seed: 0,
        },
      },
    });
    expect(settings.providerOptions?.google?.thinkingConfig).toBeUndefined();
    expect(settings.providerOptions?.vertex).toBeUndefined();
  });
});
