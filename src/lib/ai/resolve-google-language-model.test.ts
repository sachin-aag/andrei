import { afterEach, describe, expect, it } from "vitest";
import {
  getGeminiAuthDiagnostics,
  resolveGoogleLanguageModel,
} from "@/lib/ai/resolve-google-language-model";

describe("resolveGoogleLanguageModel", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses Vertex AI when GOOGLE_VERTEX_PROJECT is set", () => {
    process.env.GOOGLE_VERTEX_PROJECT = "my-gcp-project";
    process.env.GOOGLE_VERTEX_LOCATION = "us-central1";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    const model = resolveGoogleLanguageModel("gemini-2.5-flash") as {
      provider: string;
      modelId: string;
    };
    expect(model.provider).toContain("vertex");
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("uses direct Google API key when GOOGLE_GENERATIVE_AI_API_KEY is set", () => {
    delete process.env.GOOGLE_VERTEX_PROJECT;
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
    delete process.env.GOOGLE_VERTEX_PROJECT;
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
    delete process.env.GOOGLE_VERTEX_PROJECT;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;

    expect(() => resolveGoogleLanguageModel("gemini-2.5-flash")).toThrow(
      /No Gemini credentials configured/
    );
  });

  it("reports auth diagnostics without leaking secrets", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "secret";
    process.env.AI_GATEWAY_API_KEY = "also-secret";
    const diag = getGeminiAuthDiagnostics();
    expect(diag.hasGoogleKey).toBe(true);
    expect(diag.hasGatewayKey).toBe(true);
    expect(JSON.stringify(diag)).not.toContain("secret");
  });
});
