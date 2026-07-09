/**
 * Video-cost probe: measures how long and how much it costs for Gemini to
 * "watch" a video (no audio) and produce an explanation, then extrapolates the
 * measured per-second video-token rate to a full hour of footage.
 *
 * Usage:
 *   pnpm video-cost-probe                                    # default clip
 *   pnpm video-cost-probe -- --url "https://youtu.be/XXXX"   # your own video
 *   pnpm video-cost-probe -- --url "..." --model gemini-3.1-flash-lite --resolution low
 *
 * Flags:
 *   --url <youtube url>   Public/unlisted YouTube URL (one per request; Gemini fetches it directly).
 *   --duration <seconds>  Actual clip length in seconds. Used to derive the per-second
 *                         video-token rate and extrapolate to 1 hour. Default 120.
 *   --model <id>          Bare Gemini model id (no "google/" prefix). Default gemini-3.1-flash-lite.
 *   --resolution <r>      Media resolution: low | medium | high. Lower = fewer video tokens
 *                         = cheaper, at the cost of visual detail. Omit to use the model default.
 *
 * Credentials: resolved by the repo's own resolveGoogleLanguageModel(), which picks
 * (in priority order) Vertex AI (GOOGLE_VERTEX_PROJECT + ADC) → direct AI Studio key
 * (GOOGLE_GENERATIVE_AI_API_KEY) → Vercel AI Gateway (AI_GATEWAY_API_KEY). Add any one
 * of these to .env.local. NOTE: the Gateway *free* tier cannot access the Gemini 3.1
 * family — use a direct AI Studio key or Vertex for 3.1 models.
 */

import { generateText } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

/* -------------------------------------------------------------------------- */
/*  Args                                                                       */
/* -------------------------------------------------------------------------- */

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// "Me at the zoo" — the first YouTube video, ~19s, silent-ish; swap via --url.
const DEFAULT_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const videoUrl = arg("url", DEFAULT_URL)!;
const clipSeconds = Number(arg("duration", "120"));
const modelId = arg("model", "gemini-3.1-flash-lite")!; // bare id, no "google/" prefix
const resolution = arg("resolution"); // low | medium | high | undefined

const PROMPT =
  "You are analyzing silent video footage (ignore any audio). Watch the entire " +
  "video and produce a clear, structured explanation of what happens: describe " +
  "the scene, key objects and people, actions over time, and any notable changes. " +
  "Be thorough but concise.";

/* -------------------------------------------------------------------------- */
/*  Pricing — $/token. Tries live gateway rates, else a hardcoded fallback.    */
/* -------------------------------------------------------------------------- */

type Pricing = { input: number; output: number; cacheRead: number };

// Published base rates (USD per token), captured 2026-07 from the Vercel AI
// Gateway model catalog. Used when live rates can't be fetched (e.g. running
// on a direct AI Studio key with no gateway key). Keyed by bare model id.
const FALLBACK_PRICING: Record<string, Pricing> = {
  "gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015, cacheRead: 0.00000003 },
  "gemini-3.1-pro-preview": { input: 0.000002, output: 0.000012, cacheRead: 0.0000002 },
  "gemini-3.5-flash": { input: 0.0000015, output: 0.000009, cacheRead: 0.00000015 },
  "gemini-2.5-flash": { input: 0.0000003, output: 0.0000025, cacheRead: 0.00000003 },
  "gemini-2.5-pro": { input: 0.00000125, output: 0.00001, cacheRead: 0.000000125 },
};

/** Fetch live per-token rates from the gateway catalog (needs a gateway key). */
async function fetchLivePricing(bareId: string): Promise<Pricing | null> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = (await res.json()) as {
      data: { id: string; pricing?: Record<string, string> }[];
    };
    const model = json.data.find((m) => m.id === `google/${bareId}`);
    if (!model?.pricing) return null;
    return {
      input: Number(model.pricing.input ?? 0),
      output: Number(model.pricing.output ?? 0),
      cacheRead: Number(model.pricing.input_cache_read ?? 0),
    };
  } catch {
    return null;
  }
}

async function resolvePricing(bareId: string): Promise<{ pricing: Pricing | null; source: string }> {
  const live = await fetchLivePricing(bareId);
  if (live) return { pricing: live, source: "live gateway rates" };
  const fallback = FALLBACK_PRICING[bareId];
  if (fallback) return { pricing: fallback, source: "hardcoded fallback (2026-07)" };
  return { pricing: null, source: "unknown" };
}

const fmtUsd = (n: number) => `$${n.toFixed(6)}`;

/* -------------------------------------------------------------------------- */
/*  Run                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  // Reuses the repo's credential resolution: Vertex → direct AI Studio key →
  // gateway. Throws a helpful error if none are configured.
  const model = resolveGoogleLanguageModel(modelId, { vertexLocation: "global" });

  console.log("── Video cost probe ─────────────────────────────────────────");
  console.log(`  model:       ${modelId}`);
  console.log(`  video:       ${videoUrl}`);
  console.log(`  clip length: ${clipSeconds}s (as provided via --duration)`);
  console.log(`  resolution:  ${resolution ?? "(model default)"}`);
  console.log("  calling Gemini…\n");

  const started = Date.now();
  const result = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          // Google fetches YouTube URLs directly (one per request); the AI SDK
          // does NOT pre-download these. mediaType must be a video/* type.
          { type: "file", data: videoUrl, mediaType: "video/mp4" },
        ],
      },
    ],
    // Only send provider options when a resolution override was requested.
    ...(resolution
      ? { providerOptions: { google: { mediaResolution: resolution } } }
      : {}),
  });
  const elapsedMs = Date.now() - started;

  /* ---- token usage -------------------------------------------------------- */
  const usage = result.usage;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  const cachedTokens = usage.cachedInputTokens ?? 0;

  // Per-modality breakdown from Google — lets us isolate the VIDEO tokens,
  // which are what actually scale with footage length.
  const googleMeta = result.providerMetadata?.google as
    | {
        usageMetadata?: {
          promptTokensDetails?: { modality: string; tokenCount: number }[];
          thoughtsTokenCount?: number | null;
        };
      }
    | undefined;
  const promptDetails = googleMeta?.usageMetadata?.promptTokensDetails ?? [];
  const videoTokens =
    promptDetails.find((d) => d.modality?.toUpperCase() === "VIDEO")?.tokenCount ?? 0;
  const nonVideoInputTokens = Math.max(inputTokens - videoTokens, 0);

  /* ---- cost --------------------------------------------------------------- */
  const { pricing, source: pricingSource } = await resolvePricing(modelId);

  console.log("── Result ───────────────────────────────────────────────────");
  console.log(`  wall-clock time:      ${(elapsedMs / 1000).toFixed(2)}s`);
  console.log(`  finish reason:        ${result.finishReason}`);
  console.log("");
  console.log(`  input tokens:         ${inputTokens.toLocaleString()}`);
  console.log(`    ├─ video tokens:    ${videoTokens.toLocaleString()}`);
  console.log(`    └─ text/other:      ${nonVideoInputTokens.toLocaleString()}`);
  console.log(`  cached input tokens:  ${cachedTokens.toLocaleString()}`);
  console.log(`  output tokens:        ${outputTokens.toLocaleString()}`);
  console.log(`  total tokens:         ${totalTokens.toLocaleString()}`);

  if (promptDetails.length) {
    console.log(
      "  prompt modality mix:  " +
        promptDetails.map((d) => `${d.modality}=${d.tokenCount}`).join(", ")
    );
  }

  let measuredCost: number | null = null;
  if (pricing) {
    const billableInput = Math.max(inputTokens - cachedTokens, 0);
    measuredCost =
      billableInput * pricing.input +
      cachedTokens * pricing.cacheRead +
      outputTokens * pricing.output;
    console.log("");
    console.log(`  pricing source:       ${pricingSource}`);
    console.log(
      `  price/1M input:       ${fmtUsd(pricing.input * 1e6)}  ` +
        `output: ${fmtUsd(pricing.output * 1e6)}`
    );
    console.log(`  measured cost:        ${fmtUsd(measuredCost)}  (this ${clipSeconds}s clip)`);
  } else {
    console.log("\n  (could not fetch live pricing for this model — cost estimate skipped)");
  }

  /* ---- extrapolation to 1 hour ------------------------------------------- */
  console.log("\n── Extrapolation to 1 hour of footage ───────────────────────");
  if (videoTokens > 0 && clipSeconds > 0) {
    const tokensPerSec = videoTokens / clipSeconds;
    const hourVideoTokens = tokensPerSec * 3600;
    console.log(`  video tokens/second:  ${tokensPerSec.toFixed(1)}`);
    console.log(`  → 1h video tokens:    ${Math.round(hourVideoTokens).toLocaleString()}`);

    if (pricing) {
      // Assume prompt + output scale with a single call per hour of footage.
      // (For very long footage you'd chunk into multiple calls; this is the
      // simple single-request estimate.)
      const hourInputTokens = hourVideoTokens + nonVideoInputTokens;
      const hourInputCost = hourInputTokens * pricing.input;
      const hourOutputCost = outputTokens * pricing.output;
      const hourTotal = hourInputCost + hourOutputCost;
      console.log(
        `  → 1h input cost:      ${fmtUsd(hourInputCost)} ` +
          `(${Math.round(hourInputTokens).toLocaleString()} tokens)`
      );
      console.log(`  → 1h output cost:     ${fmtUsd(hourOutputCost)} (same explanation size)`);
      console.log(`  → 1h TOTAL (est):     ${fmtUsd(hourTotal)}`);
    }
  } else {
    console.log(
      "  Could not isolate video tokens from usage metadata — cannot extrapolate.\n" +
        "  (Check the prompt modality mix printed above; the provider may not have\n" +
        "   reported a VIDEO modality for this model.)"
    );
  }

  /* ---- model output ------------------------------------------------------- */
  console.log("\n── Gemini's explanation ─────────────────────────────────────");
  console.log(result.text.trim());
  console.log("\n─────────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("\n✗ Probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
