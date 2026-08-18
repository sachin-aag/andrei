import { describe, expect, it } from "vitest";
import {
  charRatio,
  charRatioInBallpark,
  evaluateCompareGate,
  idRecall,
  isWeakOcrTranscript,
  requirementIds,
  scoreQualityPage,
  sidewaysLikely,
} from "./ocr-quality";

describe("charRatioInBallpark", () => {
  it("accepts OCR that is a bit shorter than Gemini prose", () => {
    const gemini = "a".repeat(1000);
    const ocr = "a".repeat(500);
    expect(charRatio(ocr, gemini)).toBe(0.5);
    expect(charRatioInBallpark(ocr, gemini)).toBe(true);
  });

  it("rejects empty OCR against a long Gemini page", () => {
    expect(charRatioInBallpark("", "hello world ".repeat(40))).toBe(false);
  });
});

describe("sidewaysLikely", () => {
  it("flags a column of single characters", () => {
    const text = Array.from({ length: 12 }, (_, index) =>
      String.fromCharCode(65 + index)
    ).join("\n");
    expect(sidewaysLikely(text)).toBe(true);
  });

  it("accepts a normal paragraph", () => {
    expect(
      sidewaysLikely(
        "13.1 Datasheets\nSW-PA-1 Pattern requirement table\nPass Fail comments"
      )
    ).toBe(false);
  });
});

describe("idRecall", () => {
  it("counts overlapping requirement-like IDs", () => {
    const gemini = "Covered SW-PA-1 and SW-PA-2 plus ECO-12.";
    const ocr = "SW-PA-1 is listed. ECO-12 signed.";
    expect(requirementIds(gemini)).toEqual(["SW-PA-1", "SW-PA-2", "ECO-12"]);
    expect(idRecall(ocr, gemini)).toBeCloseTo(2 / 3);
  });
});

describe("isWeakOcrTranscript", () => {
  it("treats short low-alpha text as weak", () => {
    expect(isWeakOcrTranscript("hi", 0.99)).toBe(true);
    expect(isWeakOcrTranscript("!!!! ????", 0.9)).toBe(true);
  });

  it("accepts a dense table-like transcript", () => {
    const text =
      "SW-PA-1 Pattern requirement Pass\n".repeat(12) +
      "Equipment table UUT serial 12345";
    expect(isWeakOcrTranscript(text, 0.8)).toBe(false);
  });
});

describe("evaluateCompareGate", () => {
  const strong = (pageNumber: number) =>
    scoreQualityPage({
      pageNumber,
      ocrText: "SW-PA-1 Pass Fail ".repeat(40),
      ocrConfidence: 0.9,
      geminiText: "SW-PA-1 Pass Fail ".repeat(50),
    });

  it("passes when latency, four pages, and page 31 IDs hold", () => {
    const pages = [1, 4, 31, 37, 59].map(strong);
    const gate = evaluateCompareGate({ ocrElapsedMs: 20_000, pages });
    expect(gate.pass).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it("fails a slow OCR pass even if quality is fine", () => {
    const pages = [1, 4, 31, 37, 59].map(strong);
    const gate = evaluateCompareGate({ ocrElapsedMs: 120_000, pages });
    expect(gate.pass).toBe(false);
    expect(gate.latencyPass).toBe(false);
  });
});
