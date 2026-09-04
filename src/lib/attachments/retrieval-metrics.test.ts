import { describe, expect, it } from "vitest";
import {
  excerptContainsAny,
  excerptHitAtK,
  filenameMatches,
  goldHitRank,
  meanReciprocalRank,
  noFalsePositiveAtK,
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

  it("parses optional mustContain per gold hit", () => {
    const [entry] = parseRetrievalCases([
      {
        id: "x",
        query: "logic analyzer",
        kind: "semantic",
        gold: [
          {
            filename: "report.pdf",
            page: 121,
            mustContain: ["Logic Analyzer", "Saleae"],
          },
        ],
      },
    ]);
    expect(entry!.gold[0]!.mustContain).toEqual(["Logic Analyzer", "Saleae"]);
  });

  it("rejects an empty mustContain array", () => {
    expect(() =>
      parseRetrievalCases([
        {
          id: "x",
          query: "logic analyzer",
          kind: "semantic",
          gold: [{ filename: "report.pdf", page: 121, mustContain: [] }],
        },
      ])
    ).toThrow(/mustContain/);
  });

  it("allows empty gold only when mustNotContainAnywhere is set", () => {
    expect(() =>
      parseRetrievalCases([
        { id: "x", query: "SW-LWB-4", kind: "identifier", gold: [] },
      ])
    ).toThrow(/gold/);

    const [entry] = parseRetrievalCases([
      {
        id: "x",
        query: "SW-LWB-4",
        kind: "identifier",
        gold: [],
        mustNotContainAnywhere: ["SW-LWB-4"],
      },
    ]);
    expect(entry!.gold).toEqual([]);
    expect(entry!.mustNotContainAnywhere).toEqual(["SW-LWB-4"]);
  });
});

describe("excerptContainsAny", () => {
  it("matches case-insensitively across OCR line breaks", () => {
    expect(excerptContainsAny("...Logic\nAnalyzer\nSaleae...", ["Logic Analyzer"])).toBe(
      true
    );
  });

  it("does not match when the term is absent", () => {
    expect(excerptContainsAny("Torque Wrench Sturtevant Richmont", ["Logic Analyzer"])).toBe(
      false
    );
  });
});

describe("excerptHitAtK", () => {
  const gold = [
    {
      filename: "Mechanical Test Report.pdf",
      page: 121,
      mustContain: ["Logic Analyzer", "Saleae"],
    },
  ];

  it("is null when no gold hit declares mustContain", () => {
    const results = [
      { filename: "Mechanical Test Report.pdf", pageNumber: 121, text: "anything" },
    ];
    expect(
      excerptHitAtK(
        results,
        [{ filename: "Mechanical Test Report.pdf", page: 121 }],
        5
      )
    ).toBeNull();
  });

  it("reproduces the reported regression: page found, excerpt is the wrong 900 chars", () => {
    // This is the exact production failure: search returns page 121 with a
    // header/UUT-table snippet that never reaches the Table 3 equipment row.
    const results = [
      {
        filename: "Mechanical Test Report.pdf",
        pageNumber: 121,
        text: "TOP-00051 — Equipment Description Model 3 - Model System Design Verification Protocol 825-00024 Rev. G Manufacturer Cirtronics Serial Number To be noted in report Straight Handpiece New Englan…",
      },
    ];
    expect(recallAtK(results, gold, 5)).toBe(1); // page-level recall says "found"
    expect(excerptHitAtK(results, gold, 5)).toBe(0); // excerpt never proves it
  });

  it("scores 1 once the excerpt is centered on the match", () => {
    const results = [
      {
        filename: "Mechanical Test Report.pdf",
        pageNumber: 121,
        text: "…Table 3: Required Testing Equipment … Logic Analyzer Saleae (or equivalent) N/A Oscilloscope Rigol MSO1104 (or equivalent) Yes…",
      },
    ];
    expect(excerptHitAtK(results, gold, 5)).toBe(1);
  });

  it("only averages over gold hits that declare mustContain", () => {
    const mixedGold = [
      { filename: "a.pdf", page: 1, mustContain: ["Foo"] },
      { filename: "b.pdf", page: 2 }, // no content assertion
    ];
    const results = [
      { filename: "a.pdf", pageNumber: 1, text: "contains Foo here" },
      { filename: "b.pdf", pageNumber: 2, text: "irrelevant text" },
    ];
    expect(excerptHitAtK(results, mixedGold, 5)).toBe(1);
  });

  it("respects the k window like recallAtK", () => {
    const results = [
      { filename: "noise.pdf", pageNumber: 1, text: "" },
      { filename: "noise.pdf", pageNumber: 2, text: "" },
      {
        filename: "Mechanical Test Report.pdf",
        pageNumber: 121,
        text: "Logic Analyzer Saleae",
      },
    ];
    expect(excerptHitAtK(results, gold, 2)).toBe(0);
    expect(excerptHitAtK(results, gold, 5)).toBe(1);
  });
});

describe("noFalsePositiveAtK", () => {
  it("is null when no terms are declared", () => {
    const results = [{ filename: "a.pdf", pageNumber: 1, text: "SW-LWB-4" }];
    expect(noFalsePositiveAtK(results, undefined, 5)).toBeNull();
    expect(noFalsePositiveAtK(results, [], 5)).toBeNull();
  });

  it("scores 1 when a cross-document identifier does not leak into this report's hits", () => {
    // Real production shape: SW-LWB-4 is a software requirement ID that
    // only exists in an unrelated appendix; a mechanical/hardware DV report
    // must not hallucinate a page for it.
    const results = [
      { filename: "mechanical-report.pdf", pageNumber: 6, text: "Software requirements overview" },
      { filename: "mechanical-report.pdf", pageNumber: 90, text: "LWB pattern power comparison" },
    ];
    expect(noFalsePositiveAtK(results, ["SW-LWB-4"], 5)).toBe(1);
  });

  it("scores 0 when the excerpt fabricates the identifier", () => {
    const results = [
      { filename: "mechanical-report.pdf", pageNumber: 90, text: "Requirement SW-LWB-4 verified" },
    ];
    expect(noFalsePositiveAtK(results, ["SW-LWB-4"], 5)).toBe(0);
  });
});
