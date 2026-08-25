import { describe, expect, it } from "vitest";
import {
  charRatio,
  charRatioInBallpark,
  evaluateCompareGate,
  idRecall,
  isRequirementId,
  isRequirementRowId,
  isWeakOcrTranscript,
  normalizeRequirementIds,
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

  it("preserves dotted suffixes and keeps valid document identifiers", () => {
    expect(
      requirementIds(
        "Covered SW-IN-1.1, SW-SST-5.1.1, SW-WLP-24.1, ECO-12, TOP-00051, and CUS-01188."
      )
    ).toEqual([
      "SW-IN-1.1",
      "SW-SST-5.1.1",
      "SW-WLP-24.1",
      "ECO-12",
      "TOP-00051",
      "CUS-01188",
    ]);
  });

  it("drops names, table labels, and truncated family prefixes", () => {
    expect(
      requirementIds(
        "Wesley Harrington PCON PASS-FAIL REV-U TABLE-1 IEC-62304 SW-SST- leftover SW-PA-1"
      )
    ).toEqual(["SW-PA-1"]);
    expect(
      normalizeRequirementIds([
        "Wesley Harrington",
        "PCON",
        "SW-SST-",
        "SW-SST-5.1.1 extra",
      ])
    ).toEqual(["SW-SST-5.1.1"]);
    expect(isRequirementId("SW-SST-5.1.1")).toBe(true);
    expect(isRequirementId("SW-SST-")).toBe(false);
  });
});

describe("requirement IDs with an alphanumeric family prefix", () => {
  it("keeps the M3- prefix instead of matching from the second segment", () => {
    expect(requirementIds("Refer to M3-SYS-FN-037 and M3-HRS-BD-011.")).toEqual([
      "M3-SYS-FN-037",
      "M3-HRS-BD-011",
    ]);
    expect(isRequirementId("M3-SYS-FN-037")).toBe(true);
  });

  it("still keeps document and protocol numbers out", () => {
    expect(
      requirementIds(
        "Partial executions of 825-00024, Rev. G and 825-00025, Rev. F per 790-00134R."
      )
    ).toEqual([]);
  });

  it("does not report a dotted software version as an ID", () => {
    expect(requirementIds("Solea Software Version 4.8.0.982 was under test.")).toEqual(
      []
    );
  });
});

describe("isRequirementRowId", () => {
  it("accepts requirement IDs from both report families", () => {
    for (const id of [
      "SW-PA-1",
      "SW-IN-1.1",
      "SW-SST-5.1.1",
      "M3-SYS-FN-037",
      "M3-HRS-GN-001",
    ]) {
      expect(isRequirementRowId(id), id).toBe(true);
    }
  });

  it("rejects part numbers, configurations, change orders and serials", () => {
    for (const id of [
      "SUB-00448",
      "CUS-01819",
      "OTS-00325",
      "TOP-00017",
      "DCO-02058",
      "DEV-00079",
      "ECO-12",
      "SEN-0724-10001",
      "MTR-0724-10000",
      "P33-0724-10002",
    ]) {
      expect(isRequirementRowId(id), id).toBe(false);
    }
  });

  it("still treats those as valid identifiers for retrieval", () => {
    // requirementIds is deliberately wider than isRequirementRowId.
    expect(requirementIds("TOP-00051 and CUS-01188")).toEqual([
      "TOP-00051",
      "CUS-01188",
    ]);
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
