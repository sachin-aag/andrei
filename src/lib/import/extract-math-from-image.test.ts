import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  clearMathExtractionCache,
  extractMathFromImage,
  isWmfMime,
  parseLatexFromLlmResponse,
} from "@/lib/import/extract-math-from-image";

function fakePng(): Uint8Array {
  // 1x1 transparent PNG (valid header + minimal IDAT).
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  return new Uint8Array(Buffer.from(b64, "base64"));
}

describe("parseLatexFromLlmResponse", () => {
  it("passes through clean LaTeX unchanged", () => {
    expect(parseLatexFromLlmResponse(String.raw`\frac{a}{b}`)).toEqual({
      latex: String.raw`\frac{a}{b}`,
    });
  });

  it("allows simple math without backslashes", () => {
    expect(parseLatexFromLlmResponse("a + b")).toEqual({ latex: "a + b" });
    expect(parseLatexFromLlmResponse("x^2 + y^2")).toEqual({ latex: "x^2 + y^2" });
  });

  it("extracts LaTeX from prose wrappers", () => {
    expect(parseLatexFromLlmResponse("Here is the LaTeX: \\frac{a}{b}")).toEqual({
      latex: String.raw`\frac{a}{b}`,
    });
  });

  it("extracts LaTeX from fenced blocks anywhere in the response", () => {
    expect(parseLatexFromLlmResponse("```latex\nx^2\n``` extra explanation")).toEqual({
      latex: "x^2",
    });
  });

  it("parses structured JSON responses", () => {
    expect(parseLatexFromLlmResponse('{"latex":"\\\\frac{a}{b}"}')).toEqual({
      latex: String.raw`\frac{a}{b}`,
    });
  });

  it("rejects refusal prose", () => {
    expect(parseLatexFromLlmResponse("I cannot see a formula")).toEqual({
      reject: "prose_detected",
    });
  });

  it("rejects empty structured responses", () => {
    expect(parseLatexFromLlmResponse('{"latex":""}')).toEqual({
      reject: "empty_after_parse",
    });
  });

  it("rejects whitespace-only input", () => {
    expect(parseLatexFromLlmResponse("   ")).toEqual({ reject: "empty_after_parse" });
  });
});

describe("extractMathFromImage", () => {
  beforeEach(() => {
    clearMathExtractionCache();
  });

  it("recognises WMF/EMF mime variants", () => {
    expect(isWmfMime("image/x-wmf")).toBe(true);
    expect(isWmfMime("image/wmf")).toBe(true);
    expect(isWmfMime("image/x-emf")).toBe(true);
    expect(isWmfMime("image/emf")).toBe(true);
    expect(isWmfMime("image/png")).toBe(false);
    expect(isWmfMime("image/jpeg")).toBe(false);
  });

  it("returns null for unsupported mime types without calling the LLM", async () => {
    const llmCall = vi.fn();
    const result = await extractMathFromImage(
      { bytes: new Uint8Array([1, 2, 3]), mime: "image/gif" },
      { llmCall }
    );
    expect(result).toBeNull();
    expect(llmCall).not.toHaveBeenCalled();
  });

  it("returns null for empty input", async () => {
    const llmCall = vi.fn();
    const result = await extractMathFromImage(
      { bytes: new Uint8Array(0), mime: "image/png" },
      { llmCall }
    );
    expect(result).toBeNull();
    expect(llmCall).not.toHaveBeenCalled();
  });

  it("converts a PNG → LaTeX → MathML using the supplied llmCall", async () => {
    const llmCall = vi.fn().mockResolvedValue("\\frac{a}{b}");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );

    expect(llmCall).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.latex).toBe("\\frac{a}{b}");
    expect(result?.mathml).toMatch(/mfrac|fraction/i);
    expect(result?.mathml).toContain("<mi>a</mi>");
    expect(result?.mathml).toContain("<mi>b</mi>");
  });

  it("converts simple math without backslashes", async () => {
    const llmCall = vi.fn().mockResolvedValue("a + b");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result?.latex).toBe("a + b");
    expect(result?.mathml).toMatch(/<mi|<mn|<mo/i);
  });

  it("strips $ delimiters and markdown fences from LLM output", async () => {
    const llmCall = vi.fn().mockResolvedValue("```latex\n$$ x^2 + y^2 $$\n```");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result?.latex).toBe("x^2 + y^2");
  });

  it("salvages LaTeX from prose-wrapped LLM output", async () => {
    const llmCall = vi.fn().mockResolvedValue("Here is the LaTeX: \\frac{a}{b}");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result?.latex).toBe("\\frac{a}{b}");
    expect(result?.mathml).toMatch(/mfrac|fraction/i);
  });

  it("salvages LaTeX from structured JSON in raw text", async () => {
    const llmCall = vi.fn().mockResolvedValue('{"latex":"x^2"}');
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result?.latex).toBe("x^2");
  });

  it("caches results by content hash so re-imports do not call the LLM again", async () => {
    const llmCall = vi.fn().mockResolvedValue("a + b");
    const bytes = fakePng();

    const first = await extractMathFromImage(
      { bytes, mime: "image/png" },
      { llmCall }
    );
    const second = await extractMathFromImage(
      { bytes, mime: "image/png" },
      { llmCall }
    );

    expect(first).toEqual(second);
    expect(llmCall).toHaveBeenCalledTimes(1);
  });

  it("returns null when the LLM produces no usable LaTeX", async () => {
    const llmCall = vi.fn().mockResolvedValue("   ");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result).toBeNull();
  });

  it("returns null when the LLM returns refusal prose", async () => {
    const llmCall = vi.fn().mockResolvedValue("I cannot see a formula");
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result).toBeNull();
  });

  it("returns null when the LLM throws", async () => {
    const llmCall = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await extractMathFromImage(
      { bytes: fakePng(), mime: "image/png" },
      { llmCall }
    );
    expect(result).toBeNull();
  });

  it("returns deterministic stub for WMF when ALLOW_TEST_STUB_MATH_EXTRACTION is set", async () => {
    vi.stubEnv("ALLOW_TEST_STUB_MATH_EXTRACTION", "true");
    const result = await extractMathFromImage({
      bytes: new Uint8Array([1, 2, 3, 4]),
      mime: "image/x-wmf",
    });
    expect(result?.latex).toBe("x^2 + y^2");
    expect(result?.mathml).toContain("<math");
    vi.unstubAllEnvs();
  });
});
