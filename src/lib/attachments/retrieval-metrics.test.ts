import { describe, expect, it } from "vitest";
import {
  filenameMatches,
  goldHitRank,
  meanReciprocalRank,
  parseRetrievalCases,
  recallAtK,
} from "./retrieval-metrics";

describe("filenameMatches", () => {
  it("matches basename inclusion case-insensitively", () => {
    expect(
      filenameMatches(
        "Appendix-B-790-00134R-RevU.pdf",
        "appendix-b-790-00134r-revu.pdf"
      )
    ).toBe(true);
    expect(filenameMatches("other.pdf", "appendix-b-790-00134r-revu.pdf")).toBe(
      false
    );
  });
});

describe("recall and MRR", () => {
  const gold = [{ filename: "appendix-b-790-00134r-revu.pdf", page: 31 }];
  const results = [
    { filename: "noise.pdf", pageNumber: 1 },
    { filename: "appendix-b-790-00134r-revu.pdf", pageNumber: 31 },
  ];

  it("scores the gold page inside k", () => {
    expect(recallAtK(results, gold, 1)).toBe(0);
    expect(recallAtK(results, gold, 5)).toBe(1);
    expect(goldHitRank(results, gold)).toBe(2);
    expect(meanReciprocalRank(results, gold)).toBe(0.5);
  });
});

describe("parseRetrievalCases", () => {
  it("rejects an empty gold list", () => {
    expect(() =>
      parseRetrievalCases([
        { id: "x", query: "SW-LWB-4", kind: "identifier", gold: [] },
      ])
    ).toThrow(/gold/);
  });
});
