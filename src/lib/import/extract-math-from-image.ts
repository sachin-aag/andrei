import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import {
  getGeminiAuthDiagnostics,
  resolveGoogleLanguageModel,
} from "@/lib/ai/resolve-google-language-model";
import { convertLatexToMathMl, ensureMathliveSsr } from "@/lib/math/mathlive-ssr";
import { z } from "zod";

type WmfModule = {
  image_size: (data: ArrayBuffer | Uint8Array) => [number, number];
  draw_canvas: (
    data: ArrayBuffer | Uint8Array,
    canvas: HTMLCanvasElement | OffscreenCanvas
  ) => void;
};

/**
 * Vision-LLM math extraction:
 *   WMF/OLE bytes → PNG → Gemini Vision → LaTeX → MathML
 *
 * Used by the DOCX importer to turn legacy Equation Editor (Equation.3) WMF
 * formula previews into editable `mathInline`/`mathBlock` nodes instead of
 * raster images.
 */

export type MathExtractionResult = {
  latex: string;
  mathml: string;
};

export type ExtractMathInput = {
  bytes: Uint8Array;
  mime: string;
  /** Hint shown to the model — surrounding paragraph text, section name, etc. */
  contextHint?: string;
  /** Override the rendered PNG width fed to the LLM. Useful in tests. */
  displayWidth?: number;
};

/** Stable multimodal Flash — see https://ai.google.dev/gemini-api/docs/models (no `gemini-3.1-flash` id). */
const MATH_EXTRACT_GOOGLE_MODEL_ID = "gemini-2.5-flash" as const;
const MATH_EXTRACT_TEMPERATURE = 0 as const;
const MATH_EXTRACT_SEED = 0 as const;
const MATH_EXTRACT_MAX_OUTPUT_TOKENS = 1024;
const CACHE_MAX_ENTRIES = 200;
const MAX_LATEX_LENGTH = 512;

const mathExtractSchema = z.object({
  latex: z
    .string()
    .max(MAX_LATEX_LENGTH)
    .describe("LaTeX for the math expression only; empty string if the image is not math"),
});

const REFUSAL_PATTERN =
  /\b(cannot|can't|unable|sorry|not a math|no (math|equation|formula)|does not contain|cannot determine)\b/i;

const LATEX_PREFIX_PATTERNS = [
  /^(?:here(?:'s| is) (?:the )?(?:latex|equation|formula)[:\s]+)/i,
  /^(?:the (?:latex|equation|expression) is[:\s]+)/i,
  /^(?:latex[:\s]+)/i,
  /^(?:answer[:\s]+)/i,
] as const;

// ---------------------------------------------------------------------------
// WMF helpers (private — moved from former src/lib/images/wmf-render.ts)
// ---------------------------------------------------------------------------

/** Magic for Aldus Placeable Metafile header prepended to many DOCX/Word WMFs. */
const WMF_PLACEABLE_KEY = 0x9ac6cdd7;
const WMF_HEADER_BYTES = 18;
const META_ESCAPE = 1574;

function stripPlaceableWmfHeader(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 22) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== WMF_PLACEABLE_KEY) return bytes;
  return bytes.slice(22);
}

function listWmfRecords(bytes: Uint8Array, start = WMF_HEADER_BYTES) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: Array<{ off: number; func: number; recordBytes: number }> = [];
  let off = start;
  while (off + 6 <= bytes.length) {
    const sizeWords = view.getUint32(off, true);
    const func = view.getUint16(off + 4, true);
    const recordBytes = sizeWords * 2;
    if (sizeWords < 3 || recordBytes > bytes.length - off) break;
    records.push({ off, func, recordBytes });
    if (func === 0) break;
    off += recordBytes;
  }
  return records;
}

/**
 * Word Equation Editor WMFs often embed META_ESCAPE enhanced-metafile comments
 * that make the `wmf` parser throw. Removing those records still leaves the
 * text/line draws we need.
 */
function sanitizeWmfBytes(bytes: Uint8Array): Uint8Array {
  const stripped = stripPlaceableWmfHeader(bytes);
  if (stripped.length < WMF_HEADER_BYTES + 6) return stripped;

  const records = listWmfRecords(stripped, WMF_HEADER_BYTES);
  if (records.every((r) => r.func !== META_ESCAPE)) return stripped;

  const chunks: Uint8Array[] = [stripped.slice(0, WMF_HEADER_BYTES)];
  for (const record of records) {
    if (record.func === META_ESCAPE) continue;
    chunks.push(stripped.slice(record.off, record.off + record.recordBytes));
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  if (out.length >= 10) {
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setUint32(6, out.length / 2, true);
  }

  return out;
}

export function isWmfMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === "image/x-wmf" || m === "image/wmf" || m === "image/x-emf" || m === "image/emf";
}

// ---------------------------------------------------------------------------
// WMF → PNG (server only)
// ---------------------------------------------------------------------------

type CanvasLike = {
  width: number;
  height: number;
  getContext(type: "2d"): { drawImage: (image: CanvasLike, ...args: number[]) => void } | null;
  toBuffer(mime: "image/png"): Buffer;
  toDataURL(mime: string): string;
};

type CreateCanvas = (width: number, height: number) => CanvasLike;

function loadCreateCanvas(): CreateCanvas | null {
  try {
    // Lazy require so this module still loads on hosts where the optional
    // native binding is missing — extraction will fail gracefully instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@napi-rs/canvas") as { createCanvas?: CreateCanvas };
    return mod.createCanvas ?? null;
  } catch {
    return null;
  }
}

function loadWmfModuleSync(): WmfModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("wmf/dist/wmf.node.js") as WmfModule & { default?: WmfModule };
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function wmfBytesToPngBuffer(bytes: Uint8Array, displayWidth?: number): Buffer | null {
  const createCanvas = loadCreateCanvas();
  const WMF = loadWmfModuleSync();
  if (!createCanvas || !WMF) return null;

  const sanitized = sanitizeWmfBytes(bytes);
  const canvas = createCanvas(1, 1);
  try {
    WMF.draw_canvas(sanitized, canvas as unknown as HTMLCanvasElement);
  } catch {
    return null;
  }

  const targetWidth = displayWidth ?? Math.min(canvas.width, 800);
  if (targetWidth > 0 && canvas.width > targetWidth) {
    const targetHeight = Math.max(1, Math.round((canvas.height * targetWidth) / canvas.width));
    const resized = createCanvas(targetWidth, targetHeight);
    const ctx = resized.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
      return resized.toBuffer("image/png");
    }
  }

  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// LRU cache (in-process, keyed by SHA-256 of input bytes)
// ---------------------------------------------------------------------------

const cache = new Map<string, MathExtractionResult>();

function cacheGet(key: string): MathExtractionResult | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: MathExtractionResult): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** @internal exported for tests */
export function clearMathExtractionCache(): void {
  cache.clear();
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// DB cache (L2) — persists across process restarts / CI runs
// ---------------------------------------------------------------------------

async function dbCacheGet(key: string): Promise<MathExtractionResult | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    const { db } = await import("@/db");
    const { mathExtractionCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ latex: mathExtractionCache.latex, mathml: mathExtractionCache.mathml })
      .from(mathExtractionCache)
      .where(eq(mathExtractionCache.imageHash, key))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

async function dbCacheSet(key: string, value: MathExtractionResult): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { db } = await import("@/db");
    const { mathExtractionCache } = await import("@/db/schema");
    await db
      .insert(mathExtractionCache)
      .values({ imageHash: key, latex: value.latex, mathml: value.mathml })
      .onConflictDoNothing();
  } catch {
    // Non-fatal: proceed without persisting
  }
}

// ---------------------------------------------------------------------------
// LaTeX cleanup + LLM call
// ---------------------------------------------------------------------------

export type ParseLatexRejection = "prose_detected" | "empty_after_parse" | "too_long";

function stripLatexDelimiters(s: string): string {
  let t = s.trim();
  t = t.replace(/^```(?:latex|tex|math)?\s*/i, "").replace(/```$/, "").trim();
  if (t.startsWith("$$") && t.endsWith("$$")) t = t.slice(2, -2).trim();
  else if (t.startsWith("$") && t.endsWith("$")) t = t.slice(1, -1).trim();
  if (t.startsWith("\\[") && t.endsWith("\\]")) t = t.slice(2, -2).trim();
  if (t.startsWith("\\(") && t.endsWith("\\)")) t = t.slice(2, -2).trim();
  return t;
}

function extractLatexFromFence(raw: string): string | null {
  const match = raw.match(/```(?:latex|tex|math)?\s*([\s\S]*?)```/i);
  return match ? match[1]!.trim() : null;
}

/** Count lowercase English words (2+ letters) — single-letter variables are ignored. */
function countEnglishWords(s: string): number {
  return (s.match(/\b[a-z]{2,}\b/gi) ?? []).length;
}

function mathSignalScore(line: string): number {
  let score = 0;
  if (/\\/.test(line)) score += 3;
  if (/[\^_{}]/.test(line)) score += 2;
  if (/[0-9+\-*\/=<>()]/.test(line)) score += 1;
  if (REFUSAL_PATTERN.test(line)) score -= 100;
  return score;
}

function pickBestMathLine(s: string): string {
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return s.trim();

  let best = lines[0]!;
  let bestScore = mathSignalScore(best);
  for (const line of lines.slice(1)) {
    const score = mathSignalScore(line);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  return best;
}

function tryParseStructuredLatex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { latex?: unknown };
    return typeof parsed.latex === "string" ? parsed.latex.trim() : null;
  } catch {
    return null;
  }
}

function finalizeParsedLatex(s: string): { latex: string } | { reject: ParseLatexRejection } {
  const cleaned = stripLatexDelimiters(s);
  if (!cleaned) return { reject: "empty_after_parse" };
  if (cleaned.length > MAX_LATEX_LENGTH) return { reject: "too_long" };
  return { latex: cleaned };
}

/**
 * Parse and validate LaTeX from raw LLM text (structured JSON, fences, prose wrappers).
 *
 * @internal exported for tests
 */
export function parseLatexFromLlmResponse(
  raw: string
): { latex: string } | { reject: ParseLatexRejection } {
  const trimmed = raw.trim();
  if (!trimmed) return { reject: "empty_after_parse" };

  const structured = tryParseStructuredLatex(trimmed);
  if (structured !== null) {
    if (!structured) return { reject: "empty_after_parse" };
    return finalizeParsedLatex(structured);
  }

  let s = extractLatexFromFence(trimmed) ?? trimmed;
  s = pickBestMathLine(s);

  for (const prefix of LATEX_PREFIX_PATTERNS) {
    s = s.replace(prefix, "").trim();
  }

  s = stripLatexDelimiters(s);
  if (!s) return { reject: "empty_after_parse" };

  if (REFUSAL_PATTERN.test(s) && !/\\/.test(s)) {
    return { reject: "prose_detected" };
  }

  // Reject obvious prose, but allow simple math without backslashes (e.g. `a + b`, `x^2`).
  if (!/\\/.test(s) && countEnglishWords(s) > 4) {
    return { reject: "prose_detected" };
  }

  return finalizeParsedLatex(s);
}

function isUsableMathml(mathml: string): boolean {
  const trimmed = mathml.trim();
  if (!trimmed) return false;
  return /<(mi|mn|mo|mfrac|msqrt|msup|msub|msubsup|mrow|mtext|mover|munder|mtable)\b/i.test(
    trimmed
  );
}

function previewRaw(raw: string): string {
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

let cachedModel: ReturnType<typeof resolveGoogleLanguageModel> | null = null;

function resolveExtractionModel() {
  cachedModel ??= resolveGoogleLanguageModel(MATH_EXTRACT_GOOGLE_MODEL_ID);
  return cachedModel;
}

const SYSTEM_PROMPT =
  "You convert images of mathematical expressions to LaTeX. " +
  'Respond with JSON matching the schema: { "latex": "<expression>" }. ' +
  "Put only the LaTeX code in `latex` — no prose, markdown fences, or $ delimiters. " +
  "Use standard LaTeX (\\frac, \\sqrt, ^, _, \\times, \\sum, \\int, \\alpha, \\beta, …). " +
  'If the image is not a mathematical expression, set "latex" to an empty string.';

/** @internal exported for tests */
export type LlmCallFn = (args: {
  pngBytes: Uint8Array;
  contextHint?: string;
}) => Promise<string>;

async function defaultLlmCall(args: {
  pngBytes: Uint8Array;
  contextHint?: string;
}): Promise<string> {
  const userText =
    args.contextHint && args.contextHint.trim()
      ? `Context (surrounding text from the document, may help disambiguate symbols):\n${args.contextHint.trim()}\n\nReturn JSON with the LaTeX for the math expression in the image.`
      : "Return JSON with the LaTeX for the math expression in the image.";

  try {
    const result = await generateText({
      model: resolveExtractionModel(),
      output: Output.object({ schema: mathExtractSchema }),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image", image: args.pngBytes, mediaType: "image/png" },
          ],
        },
      ],
      temperature: MATH_EXTRACT_TEMPERATURE,
      maxOutputTokens: MATH_EXTRACT_MAX_OUTPUT_TOKENS,
      providerOptions: { google: { seed: MATH_EXTRACT_SEED } },
    });

    const structuredLatex = result.experimental_output?.latex?.trim() ?? "";
    if (structuredLatex) return structuredLatex;
    return result.text;
  } catch (err: unknown) {
    const errText =
      err && typeof err === "object" && "text" in err
        ? String((err as { text: string }).text)
        : "";
    if (errText) return errText;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExtractMathOptions = {
  /** Override the LLM call (used by tests). */
  llmCall?: LlmCallFn;
};

/**
 * Extract a math expression from an image's bytes. Returns null if:
 *   - the image cannot be rendered to PNG (missing native bindings, parse error)
 *   - the LLM returns an empty/unusable response
 *   - the LaTeX cannot be converted to MathML
 *
 * Results are cached in-process (L1) and in the DB (L2, keyed by content hash),
 * so re-importing the same DOCX — even across process restarts / CI runs — never
 * re-invokes the model.
 */
export async function extractMathFromImage(
  input: ExtractMathInput,
  options: ExtractMathOptions = {}
): Promise<MathExtractionResult | null> {
  if (!input.bytes.length) return null;

  const key = hashBytes(input.bytes);
  const shortKey = key.slice(0, 12);

  const cached = cacheGet(key);
  if (cached) {
    console.log(`[extract-math] L1 cache hit ${shortKey}`);
    return cached;
  }

  // Skip DB cache when llmCall is overridden — that path is used by tests that
  // control LLM output directly and must not be affected by cached real data.
  if (!options.llmCall) {
    const dbHit = await dbCacheGet(key);
    if (dbHit) {
      console.log(`[extract-math] L2 db cache hit ${shortKey}`);
      cacheSet(key, dbHit);
      return dbHit;
    }
  }

  console.log(`[extract-math] gemini call ${shortKey}`);

  let pngBytes: Uint8Array | null = null;
  if (isWmfMime(input.mime)) {
    const buf = wmfBytesToPngBuffer(input.bytes, input.displayWidth);
    if (!buf) {
      console.error("[extract-math] rejected: wmf_render_failed", {
        mime: input.mime,
        byteLength: input.bytes.length,
        hasCanvas: !!loadCreateCanvas(),
        hasWmf: !!loadWmfModuleSync(),
      });
      return null;
    }
    pngBytes = buf;
  } else if (input.mime === "image/png" || input.mime === "image/jpeg") {
    pngBytes = input.bytes;
  } else {
    return null;
  }

  let latex: string;
  try {
    const llmCall = options.llmCall ?? defaultLlmCall;
    const raw = await llmCall({ pngBytes, contextHint: input.contextHint });
    const parsed = parseLatexFromLlmResponse(raw);
    if ("reject" in parsed) {
      console.error(`[extract-math] rejected: ${parsed.reject}`, {
        preview: previewRaw(raw),
      });
      return null;
    }
    latex = parsed.latex;
  } catch (err) {
    console.error("[extract-math] LLM call failed:", err, getGeminiAuthDiagnostics());
    return null;
  }

  let mathml: string;
  try {
    await ensureMathliveSsr();
    mathml = convertLatexToMathMl(latex);
  } catch (err) {
    console.error("[extract-math] rejected: latex_to_mathml_failed", {
      preview: previewRaw(latex),
      err,
    });
    return null;
  }

  if (!isUsableMathml(mathml)) {
    console.error("[extract-math] rejected: latex_to_mathml_failed", {
      preview: previewRaw(latex),
      mathmlPreview: previewRaw(mathml),
    });
    return null;
  }

  const result: MathExtractionResult = { latex, mathml };
  cacheSet(key, result);
  if (!options.llmCall) void dbCacheSet(key, result);
  return result;
}
