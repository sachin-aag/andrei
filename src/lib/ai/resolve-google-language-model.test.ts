import { afterEach, describe, expect, it } from "vitest";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

describe("resolveGoogleLanguageModel", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses direct Google API key when GOOGLE_GENERATIVE_AI_API_KEY is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-direct";
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    const model = resolveGoogleLanguageModel("gemini-2.5-flash") as {
      provider: string;
      modelId: string;
    };
    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("routes through AI Gateway when only gateway credentials are set", () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "gateway-key";

    const model = resolveGoogleLanguageModel("gemini-2.5-flash") as {
      provider: string;
      modelId: string;
    };
    expect(model.provider).toBe("gateway");
    expect(model.modelId).toBe("google/gemini-2.5-flash");
  });

  it("throws when no credentials are configured", () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    expect(() => resolveGoogleLanguageModel("gemini-2.5-flash")).toThrow(
      /No Gemini credentials configured/
    );
  });
});
