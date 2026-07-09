/**
 * Video model comparison: runs the same "explain this silent video" task across
 * several models and configurations, measures time + token usage + cost for each,
 * extrapolates the per-second (video/image) token rate to 1 hour of footage,
 * records each model's output, captures the source video's quality via yt-dlp,
 * and writes a markdown report.
 *
 * What it compares:
 *   - Gemini models via native video input, swept across media resolutions
 *     (e.g. "default" vs "low") so you can see the cost-vs-detail tradeoff.
 *   - Gemma via a frame-sampling fallback: since Gemma can't ingest video, the
 *     script downloads the clip (yt-dlp), samples frames at a fixed fps
 *     (ffmpeg, 1 fps by default — matching how Gemini samples video), and sends
 *     them as images.
 *
 * Usage:
 *   pnpm video-model-compare
 *   pnpm video-model-compare -- --url "https://youtu.be/XXXX"
 *   pnpm video-model-compare -- --url "..." --duration 90 --resolutions low,default,high --fps 1
 *
 * Flags:
 *   --url <youtube url>     Public/unlisted YouTube URL. Default: a short neutral clip.
 *   --duration <seconds>    Override clip length. Default: auto-detected via yt-dlp.
 *   --resolutions <list>    Comma list of Gemini media resolutions to sweep:
 *                           default | low | medium | high. Default: "low,default,high".
 *   --fps <n>               Gemma frame-sampling rate (frames/sec). Default: 1.
 *   --max-frames <n>        Cap on frames sent to Gemma. Default: 600.
 *   --out <path>            Output markdown path. Default: docs/video-model-comparison.md
 *
 * Requires: yt-dlp + ffmpeg on PATH (for video quality metadata and frame sampling).
 *
 * Credentials (resolved automatically per model):
 *   - Gemini models  → Vertex AI (GOOGLE_VERTEX_PROJECT + ADC). Refresh with
 *                      `gcloud auth application-default login`.
 *   - Gemma models   → Vercel AI Gateway (AI_GATEWAY_API_KEY). Vertex does not
 *                      publish Gemma on the standard endpoint.
 */

import { generateText, type LanguageModel } from "ai";
import { createGatewayProvider } from "@ai-sdk/gateway";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------- */
/*  Args                                                                       */
/* -------------------------------------------------------------------------- */

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// "Me at the zoo" — the first YouTube video (~19s). Override with --url.
const DEFAULT_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const videoUrl = arg("url", DEFAULT_URL)!;
const durationOverride = arg("duration");
const resolutions = arg("resolutions", "low,default,high")!.split(",").map((s) => s.trim());
const framesFps = Number(arg("fps", "1")); // Gemma frame-sampling rate (frames/sec)
const maxFrames = Number(arg("max-frames", "600")); // safety cap on total frames sent
const outPath = arg("out", "docs/video-model-comparison.md")!;

const VIDEO_PROMPT =
  "You are analyzing silent video footage (ignore any audio). Watch the entire " +
  "video and produce a clear, structured explanation of what happens: describe " +
  "the scene, key objects and people, actions over time, and any notable changes. " +
  "Be thorough but concise.";

/* -------------------------------------------------------------------------- */
/*  Models under test                                                          */
/* -------------------------------------------------------------------------- */

type Provider = "vertex" | "gateway";
type Kind = "video" | "frames";

type ModelSpec = {
  label: string;
  id: string; // bare id for vertex, or gateway id (google/...) for gateway
  provider: Provider;
  kind: Kind; // "video" = native video input; "frames" = image-per-frame fallback
  pricing: { input: number; output: number; cacheRead: number }; // USD/token
};

// Rates captured 2026-07 from the Vercel AI Gateway catalog (USD per token).
// Vertex per-token pricing matches the published gateway rates for these models.
const MODELS: ModelSpec[] = [
  {
    label: "Gemini 3.1 Flash Lite",
    id: "gemini-3.1-flash-lite",
    provider: "vertex",
    kind: "video",
    pricing: { input: 0.00000025, output: 0.0000015, cacheRead: 0.00000003 },
  },
  {
    label: "Gemini 3.1 Pro (preview)",
    id: "gemini-3.1-pro-preview",
    provider: "vertex",
    kind: "video",
    pricing: { input: 0.000002, output: 0.000012, cacheRead: 0.0000002 },
  },
  {
    label: "Gemini 3.5 Flash",
    id: "gemini-3.5-flash",
    provider: "vertex",
    kind: "video",
    pricing: { input: 0.0000015, output: 0.000009, cacheRead: 0.00000015 },
  },
  {
    // Gemma can't ingest video, so it runs on sampled frames (images) instead.
    label: "Gemma 4 31B",
    id: "google/gemma-4-31b-it",
    provider: "gateway",
    kind: "frames",
    pricing: { input: 0.00000014, output: 0.0000004, cacheRead: 0 },
  },
];

/** One concrete run: a model in a specific configuration. */
type RunConfig = {
  spec: ModelSpec;
  modeLabel: string; // e.g. "video · low", "frames@1fps"
  resolution?: string; // Gemini media resolution, undefined = model default
  fps?: number; // frame-sampling rate for the frames fallback
};

function buildRuns(): RunConfig[] {
  const runs: RunConfig[] = [];
  for (const spec of MODELS) {
    if (spec.kind === "video") {
      for (const res of resolutions) {
        const resolution = res === "default" ? undefined : res;
        runs.push({ spec, resolution, modeLabel: `video · ${res}` });
      }
    } else {
      runs.push({ spec, fps: framesFps, modeLabel: `frames@${framesFps}fps` });
    }
  }
  return runs;
}

/* -------------------------------------------------------------------------- */
/*  Providers                                                                  */
/* -------------------------------------------------------------------------- */

// Map the friendly --resolutions value to Gemini's provider-option enum.
const MEDIA_RESOLUTION_ENUM: Record<string, string> = {
  low: "MEDIA_RESOLUTION_LOW",
  medium: "MEDIA_RESOLUTION_MEDIUM",
  high: "MEDIA_RESOLUTION_HIGH",
};
function mediaResolutionEnum(res: string): string {
  const v = MEDIA_RESOLUTION_ENUM[res];
  if (!v) throw new Error(`Unknown media resolution "${res}" (use default | low | medium | high).`);
  return v;
}

let gatewayProvider: ReturnType<typeof createGatewayProvider> | null = null;

function resolveModel(spec: ModelSpec): LanguageModel {
  if (spec.provider === "vertex") {
    return resolveGoogleLanguageModel(spec.id, { vertexLocation: "global" });
  }
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) throw new Error("AI_GATEWAY_API_KEY not set (needed for gateway models like Gemma).");
  gatewayProvider ??= createGatewayProvider({ apiKey: key });
  return gatewayProvider(spec.id);
}

/* -------------------------------------------------------------------------- */
/*  Video metadata (quality)                                                   */
/* -------------------------------------------------------------------------- */

type VideoInfo = {
  title: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  filesizeMb: number | null;
  quality: string;
  source: string; // yt-dlp | oembed | unknown
};

async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["-j", "--no-warnings", url], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const width = (j.width as number) ?? null;
    const height = (j.height as number) ?? null;
    const fps = (j.fps as number) ?? null;
    const filesize = (j.filesize as number) ?? (j.filesize_approx as number) ?? null;
    return {
      title: (j.title as string) ?? "(unknown)",
      durationSec: (j.duration as number) ?? null,
      width,
      height,
      fps,
      vcodec: (j.vcodec as string) ?? null,
      filesizeMb: filesize ? filesize / 1e6 : null,
      quality: height ? `${height}p${fps ? ` @ ${Math.round(fps)}fps` : ""}` : "unknown",
      source: "yt-dlp",
    };
  } catch {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      const j = (await res.json()) as { title?: string };
      return {
        title: j.title ?? "(unknown)",
        durationSec: null, width: null, height: null, fps: null,
        vcodec: null, filesizeMb: null,
        quality: "unknown (yt-dlp unavailable)", source: "oembed",
      };
    } catch {
      return {
        title: "(unknown)", durationSec: null, width: null, height: null,
        fps: null, vcodec: null, filesizeMb: null, quality: "unknown", source: "unknown",
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Frame sampling (for the Gemma image fallback)                              */
/* -------------------------------------------------------------------------- */

let cachedFrames: { fps: number; frames: Buffer[] } | null = null;

/** Download the clip with yt-dlp, retrying a few times (YouTube is flaky). */
async function downloadClip(url: string, dir: string): Promise<void> {
  const attempts = 3;
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      await execFileAsync(
        "yt-dlp",
        ["-f", "best[height<=480]/best", "-o", path.join(dir, "v.%(ext)s"), "--no-warnings", url],
        { maxBuffer: 128 * 1024 * 1024 }
      );
      if (readdirSync(dir).some((f) => f.startsWith("v."))) return;
      lastErr = "download produced no file";
    } catch (e) {
      // execFile errors carry stderr — surface it instead of the truncated cmd.
      const err = e as { stderr?: string; message?: string };
      lastErr = (err.stderr || err.message || String(e)).trim();
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
  }
  throw new Error(`yt-dlp failed after ${attempts} attempts: ${lastErr.slice(-400)}`);
}

/** Download the clip and sample JPEG frames at `fps` (1 = one frame/sec) via ffmpeg. */
async function extractFrames(url: string, fps: number): Promise<Buffer[]> {
  if (cachedFrames && cachedFrames.fps === fps) return cachedFrames.frames;
  const dir = mkdtempSync(path.join(os.tmpdir(), "vframes-"));
  try {
    await downloadClip(url, dir);
    const vfile = readdirSync(dir).find((f) => f.startsWith("v."));
    if (!vfile) throw new Error("yt-dlp download produced no file");
    const input = path.join(dir, vfile);

    // fps=1 → one frame per second (matches how Gemini samples video). Capped
    // at maxFrames to bound token cost. Frames are downscaled to <=256px wide and
    // JPEG-compressed: models tile images to a fixed token cost regardless of
    // resolution, so this only shrinks the request payload. It matters because
    // Gemma routes through the AI Gateway (not Vertex), whose request-body limit
    // rejects many full-size frames ("Payload Too Large").
    await execFileAsync("ffmpeg", [
      "-loglevel", "error", "-i", input,
      "-vf", `fps=${fps},scale='min(256,iw)':-2`,
      "-q:v", "8", "-frames:v", String(maxFrames),
      path.join(dir, "f_%04d.jpg"),
    ]);

    const frames = readdirSync(dir)
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f)));
    if (!frames.length) throw new Error("ffmpeg extracted no frames");
    cachedFrames = { fps, frames };
    return frames;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/*  Token modality helpers                                                     */
/* -------------------------------------------------------------------------- */

type ModalityDetail = { modality: string; tokenCount: number };

/** Read the per-modality prompt breakdown from wherever the provider put it. */
function extractPromptModalities(result: {
  usage: { raw?: unknown };
  providerMetadata?: Record<string, unknown>;
}): ModalityDetail[] {
  const fromVertex = (result.usage.raw as { promptTokensDetails?: ModalityDetail[] } | undefined)
    ?.promptTokensDetails;
  if (fromVertex?.length) return fromVertex;
  const google = result.providerMetadata?.google as
    | { usageMetadata?: { promptTokensDetails?: ModalityDetail[] } }
    | undefined;
  return google?.usageMetadata?.promptTokensDetails ?? [];
}

function modalityTokens(details: ModalityDetail[], modality: string): number {
  return details.find((d) => d.modality?.toUpperCase() === modality)?.tokenCount ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Run one configuration                                                      */
/* -------------------------------------------------------------------------- */

type RunResult = {
  cfg: RunConfig;
  ok: boolean;
  error?: string;
  elapsedMs: number;
  inputTokens?: number;
  scalableTokens?: number; // tokens that scale with footage length (video or image)
  scalableKind?: "video" | "image";
  scalableApprox?: boolean; // true if scalable count was estimated, not reported
  frameCount?: number; // frames sent (frames mode only)
  effectiveFps?: number; // frames sent ÷ clip seconds (frames mode only)
  requestCount?: number; // number of model calls (frames mode chunks + synthesis)
  audioTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  measuredCost?: number;
  hourCost?: number;
  text?: string;
};

const isPayloadError = (msg: string) =>
  /payload too large|request entity too large|\b413\b/i.test(msg);

/** Extrapolate a per-hour cost from a clip's scalable (duration-growing) tokens. */
function hourlyCost(
  pricing: ModelSpec["pricing"],
  scalableTokens: number,
  fixedInputTokens: number,
  outputTokens: number,
  clipSeconds: number | null
): number | undefined {
  if (scalableTokens <= 0 || !clipSeconds || clipSeconds <= 0) return undefined;
  const hourScalable = (scalableTokens / clipSeconds) * 3600;
  return (hourScalable + fixedInputTokens) * pricing.input + outputTokens * pricing.output;
}

async function runConfig(cfg: RunConfig, clipSeconds: number | null): Promise<RunResult> {
  return cfg.spec.kind === "frames"
    ? runFramesConfig(cfg, clipSeconds)
    : runVideoConfig(cfg, clipSeconds);
}

/** Native-video path: one call, media-resolution sweep. */
async function runVideoConfig(cfg: RunConfig, clipSeconds: number | null): Promise<RunResult> {
  const started = Date.now();
  try {
    const result = await generateText({
      model: resolveModel(cfg.spec),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VIDEO_PROMPT },
            { type: "file", data: videoUrl, mediaType: "video/mp4" },
          ],
        },
      ],
      ...(cfg.resolution
        ? { providerOptions: { google: { mediaResolution: mediaResolutionEnum(cfg.resolution) } } }
        : {}),
    });
    const elapsedMs = Date.now() - started;

    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const totalTokens = result.usage.totalTokens ?? inputTokens + outputTokens;
    const cachedTokens = result.usage.cachedInputTokens ?? 0;
    const promptDetails = extractPromptModalities(result);
    const audioTokens = modalityTokens(promptDetails, "AUDIO");
    const scalableTokens = modalityTokens(promptDetails, "VIDEO");
    const fixedInputTokens = Math.max(inputTokens - scalableTokens - audioTokens, 0);

    const measuredCost =
      Math.max(inputTokens - cachedTokens, 0) * cfg.spec.pricing.input +
      cachedTokens * cfg.spec.pricing.cacheRead +
      outputTokens * cfg.spec.pricing.output;

    return {
      cfg, ok: true, elapsedMs, inputTokens, scalableTokens, scalableKind: "video",
      audioTokens, outputTokens, totalTokens, cachedTokens, measuredCost,
      hourCost: hourlyCost(cfg.spec.pricing, scalableTokens, fixedInputTokens, outputTokens, clipSeconds),
      text: result.text.trim(),
    };
  } catch (e) {
    return { cfg, ok: false, elapsedMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Frame-sampling path (Gemma): the full 1-fps frame set won't fit one gateway
 * request, so frames are split into payload-sized batches. Each batch gets a
 * segment description, then a final text-only synthesis call stitches the
 * segments into one coherent explanation. Cost/time aggregate across all calls.
 */
async function runFramesConfig(cfg: RunConfig, clipSeconds: number | null): Promise<RunResult> {
  const started = Date.now();
  try {
    const model = resolveModel(cfg.spec);
    const frames = await extractFrames(videoUrl, cfg.fps!);
    const secPerFrame = clipSeconds && frames.length ? clipSeconds / frames.length : 1;

    // Describe frames in batches, shrinking the batch size if a batch 413s.
    let batchSize = Math.min(24, frames.length);
    const segments: string[] = [];
    let inTok = 0, outTok = 0, cachedTok = 0, imageApproxTok = 0, calls = 0;

    for (let start = 0; start < frames.length; ) {
      const batch = frames.slice(start, start + batchSize);
      const startSec = Math.round(start * secPerFrame);
      const endSec = Math.round((start + batch.length) * secPerFrame);
      try {
        const r = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `These ${batch.length} still frames are seconds ${startSec}–${endSec} of a ` +
                    `longer silent video (chronological order). Describe what happens in this ` +
                    `segment: scene, people/objects, actions, and any changes. Be concise.`,
                },
                ...batch.map((f) => ({ type: "image" as const, image: f })),
              ],
            },
          ],
        });
        const bIn = r.usage.inputTokens ?? 0;
        inTok += bIn;
        outTok += r.usage.outputTokens ?? 0;
        cachedTok += r.usage.cachedInputTokens ?? 0;
        // Approx image tokens = batch input minus its (small) text prompt.
        imageApproxTok += Math.max(bIn - 40, 0);
        segments.push(`Seconds ${startSec}–${endSec}: ${r.text.trim()}`);
        calls++;
        start += batchSize;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isPayloadError(msg) && batchSize > 4) {
          batchSize = Math.floor(batchSize / 2);
          continue; // retry this position with a smaller batch
        }
        throw e;
      }
    }

    // Synthesis: combine segment summaries into one explanation (text-only).
    const synth = await generateText({
      model,
      prompt:
        `The following are ordered segment descriptions of a single silent video, each covering ` +
        `a few seconds. Combine them into one clear, structured explanation of the whole video ` +
        `(scene, key people/objects, actions over time, notable changes). Do not mention "segments".\n\n` +
        segments.join("\n\n"),
    });
    inTok += synth.usage.inputTokens ?? 0;
    outTok += synth.usage.outputTokens ?? 0;
    cachedTok += synth.usage.cachedInputTokens ?? 0;
    calls++;

    const elapsedMs = Date.now() - started;
    const scalableTokens = imageApproxTok; // image tokens scale with footage length
    const fixedInputTokens = Math.max(inTok - scalableTokens, 0);
    const measuredCost =
      Math.max(inTok - cachedTok, 0) * cfg.spec.pricing.input +
      cachedTok * cfg.spec.pricing.cacheRead +
      outTok * cfg.spec.pricing.output;

    return {
      cfg, ok: true, elapsedMs,
      inputTokens: inTok, scalableTokens, scalableKind: "image", scalableApprox: true,
      frameCount: frames.length,
      effectiveFps: clipSeconds && clipSeconds > 0 ? frames.length / clipSeconds : undefined,
      requestCount: calls,
      audioTokens: 0, outputTokens: outTok, totalTokens: inTok + outTok, cachedTokens: cachedTok,
      measuredCost,
      hourCost: hourlyCost(cfg.spec.pricing, scalableTokens, fixedInputTokens, outTok, clipSeconds),
      text: synth.text.trim(),
    };
  } catch (e) {
    return { cfg, ok: false, elapsedMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

const usd = (n: number | undefined) => (n === undefined ? "—" : `$${n.toFixed(6)}`);
const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());

/* -------------------------------------------------------------------------- */
/*  Report                                                                     */
/* -------------------------------------------------------------------------- */

function buildMarkdown(video: VideoInfo, clipSeconds: number | null, results: RunResult[]): string {
  const lines: string[] = [];

  lines.push("# Video → explanation: model cost & quality comparison");
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()} by \`pnpm video-model-compare\`._`);
  lines.push("");

  lines.push("## Source video");
  lines.push("");
  lines.push(`- **URL:** ${videoUrl}`);
  lines.push(`- **Title:** ${video.title}`);
  lines.push(`- **Quality:** ${video.quality}`);
  if (video.width && video.height) lines.push(`- **Resolution:** ${video.width}×${video.height}`);
  if (video.vcodec) lines.push(`- **Video codec:** ${video.vcodec}`);
  if (video.filesizeMb) lines.push(`- **File size:** ${video.filesizeMb.toFixed(1)} MB`);
  lines.push(
    `- **Duration:** ${clipSeconds ? `${clipSeconds}s` : "unknown"}${
      durationOverride ? " (overridden via --duration)" : video.source === "yt-dlp" ? " (from yt-dlp)" : ""
    }`
  );
  lines.push(`- **Audio:** ignored (task is video-only)`);
  lines.push(`- **Metadata source:** ${video.source}`);
  lines.push("");

  lines.push("## Run configuration");
  lines.push("");
  lines.push(`- **Gemini media resolutions swept:** ${resolutions.join(", ")}`);
  lines.push(
    `- **Gemma frame sampling:** ${framesFps} fps (one frame every ${(1 / framesFps).toFixed(
      framesFps >= 1 ? 0 : 1
    )}s, capped at ${maxFrames} frames)`
  );
  lines.push(`- **Video prompt:** ${VIDEO_PROMPT}`);
  lines.push("");

  lines.push("## Cost & performance comparison");
  lines.push("");
  lines.push(
    "| Model | Mode | Status | Time | Video/Image tokens | Audio tokens | Input tokens | Output tokens | Cost (this clip) | Cost / hour of silent footage |"
  );
  lines.push("|---|---|---|--:|--:|--:|--:|--:|--:|--:|");
  for (const r of results) {
    if (r.ok) {
      const scalable = `${num(r.scalableTokens)}${r.scalableApprox ? "*" : ""}`;
      lines.push(
        `| ${r.cfg.spec.label} | ${r.cfg.modeLabel} | ✅ ok | ${(r.elapsedMs / 1000).toFixed(2)}s | ${scalable} | ${num(
          r.audioTokens
        )} | ${num(r.inputTokens)} | ${num(r.outputTokens)} | ${usd(r.measuredCost)} | ${usd(r.hourCost)} |`
      );
    } else {
      lines.push(
        `| ${r.cfg.spec.label} | ${r.cfg.modeLabel} | ❌ failed | ${(r.elapsedMs / 1000).toFixed(2)}s | — | — | — | — | — | — |`
      );
    }
  }
  lines.push("");
  lines.push(
    "> _Cost / hour of silent footage_ extrapolates the measured **video/image** token rate " +
      "(scalable tokens ÷ clip seconds × 3600) at the model's input price, plus this run's prompt " +
      "and output cost held constant. It excludes audio tokens — the target is footage with no audio. " +
      "For the Gemma frame fallback, frames are split across multiple gateway requests " +
      "(segment descriptions + a synthesis pass); cost and time aggregate across all calls, and the " +
      "per-hour figure assumes the same fps scaled up (`fps × 3600` frames/hour). `*` marks an estimated token count " +
      "(provider did not report an image modality). A real hour of footage would be split across many " +
      "requests, so treat these as per-hour unit-cost estimates, not single-call quotes."
  );
  lines.push("");

  // Takeaways (computed from this run)
  const priced = results.filter((r) => r.ok && r.hourCost !== undefined);
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => (a.hourCost! <= b.hourCost! ? a : b));
    const priciest = priced.reduce((a, b) => (a.hourCost! >= b.hourCost! ? a : b));
    lines.push("## Takeaways");
    lines.push("");
    lines.push(
      `- **Cheapest for a full hour of silent footage:** ${cheapest.cfg.spec.label} (${cheapest.cfg.modeLabel}) at ~${usd(
        cheapest.hourCost
      )}/hr.`
    );
    lines.push(
      `- **Most expensive:** ${priciest.cfg.spec.label} (${priciest.cfg.modeLabel}) at ~${usd(
        priciest.hourCost
      )}/hr (${(priciest.hourCost! / cheapest.hourCost!).toFixed(1)}× the cheapest).`
    );

    // Resolution tradeoff: pick a model that ran at both default and low.
    const byModel = new Map<string, RunResult[]>();
    for (const r of priced.filter((r) => r.cfg.spec.kind === "video")) {
      const arr = byModel.get(r.cfg.spec.label) ?? [];
      arr.push(r);
      byModel.set(r.cfg.spec.label, arr);
    }
    for (const [label, runs] of byModel) {
      const def = runs.find((r) => r.cfg.resolution === undefined);
      const low = runs.find((r) => r.cfg.resolution === "low");
      const high = runs.find((r) => r.cfg.resolution === "high");
      if (def && high && def.hourCost && high.hourCost) {
        const mult = high.hourCost / def.hourCost;
        const lowSame = low && low.scalableTokens === def.scalableTokens;
        lines.push(
          `- **Resolution lever (${label}):** \`high\` media resolution costs ~${usd(high.hourCost)}/hr vs ` +
            `~${usd(def.hourCost)}/hr at default — about **${mult.toFixed(1)}× more** ` +
            `(${num(high.scalableTokens)} vs ${num(def.scalableTokens)} video tokens) for finer visual detail.` +
            (lowSame
              ? ` Note: \`low\` produces the **same** token count as default (${num(
                  def.scalableTokens
                )}) — Gemini 3.x already samples video at the low rate, so \`low\` is a no-op and only \`high\` moves cost.`
              : "")
        );
        break;
      }
    }

    const gemma = results.find((r) => r.cfg.spec.kind === "frames");
    if (gemma?.ok) {
      lines.push(
        `- **Gemma via frames works but needs chunking:** at ${framesFps} fps the ${num(
          gemma.frameCount
        )} frames exceed one AI-Gateway request, so they were split across **${gemma.requestCount} calls** ` +
          `(segment descriptions + a synthesis pass). Cost ~${usd(gemma.hourCost)}/hr. It still never sees ` +
          `motion *between* frames, so fast actions and timing can be missed; higher fps raises cost and fidelity.`
      );
    } else if (gemma && !gemma.ok) {
      lines.push(`- **Gemma frame fallback failed:** \`${gemma.error}\``);
    }
    lines.push("");
  }

  lines.push("## Model outputs");
  lines.push("");
  for (const r of results) {
    lines.push(`### ${r.cfg.spec.label} — ${r.cfg.modeLabel} (\`${r.cfg.spec.id}\`, ${r.cfg.spec.provider})`);
    lines.push("");
    if (r.ok) {
      const frameNote = r.frameCount
        ? `${num(r.frameCount)} frames @ ${r.effectiveFps?.toFixed(2)}fps across ${r.requestCount} requests · `
        : "";
      lines.push(
        `_${(r.elapsedMs / 1000).toFixed(2)}s · ${frameNote}${num(r.scalableTokens)} ${r.scalableKind} tokens · ${num(
          r.outputTokens
        )} output tokens · ${usd(r.measuredCost)} this clip · ${usd(r.hourCost)}/hr_`
      );
      lines.push("");
      lines.push(r.text ?? "");
    } else {
      lines.push(`**Failed:** \`${r.error}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("── Fetching video quality (yt-dlp) …");
  const video = await getVideoInfo(videoUrl);
  const clipSeconds = durationOverride ? Number(durationOverride) : video.durationSec;
  console.log(`  ${video.title}`);
  console.log(`  quality: ${video.quality} · duration: ${clipSeconds ?? "?"}s\n`);

  const runs = buildRuns();
  const results: RunResult[] = [];
  for (const cfg of runs) {
    process.stdout.write(`── ${cfg.spec.label} [${cfg.modeLabel}] … `);
    const r = await runConfig(cfg, clipSeconds);
    if (r.ok) {
      console.log(
        `ok in ${(r.elapsedMs / 1000).toFixed(2)}s · ${num(r.scalableTokens)} ${r.scalableKind} tok · ${usd(
          r.measuredCost
        )} clip · ${usd(r.hourCost)}/hr`
      );
    } else {
      console.log(`FAILED: ${r.error?.slice(0, 100)}`);
    }
    results.push(r);
  }

  const md = buildMarkdown(video, clipSeconds, results);
  const abs = path.resolve(outPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, md, "utf8");
  console.log(`\n✓ Report written to ${outPath}`);
}

main().catch((err) => {
  console.error("\n✗ Comparison failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
