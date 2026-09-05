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
  it("requires passCriteria", () => {
    expect(() =>
      parseRetrievalCases([
        {
          id: "x",
          query: "SW-EVAL-7",
          kind: "identifier",
          gold: [{ filename: "software-requirements.pdf", page: 2 }],
        },
      ])
    ).toThrow(/passCriteria/);
  });

  it("parses optional mustContain per gold hit", () => {
    const [entry] = parseRetrievalCases([
      {
        id: "x",
        query: "portable spectrum analyzer",
        kind: "semantic",
        passCriteria: "Must name Narda SRM-3006",
        gold: [
          {
            filename: "report.pdf",
            page: 2,
            mustContain: ["Portable Spectrum Analyzer", "Narda"],
          },
        ],
      },
    ]);
    expect(entry!.gold[0]!.mustContain).toEqual([
      "Portable Spectrum Analyzer",
      "Narda",
    ]);
    expect(entry!.passCriteria).toBe("Must name Narda SRM-3006");
  });

  it("rejects an empty mustContain array", () => {
    expect(() =>
      parseRetrievalCases([
        {
          id: "x",
          query: "portable spectrum analyzer",
          kind: "semantic",
          passCriteria: "Must name the instrument",
          gold: [{ filename: "report.pdf", page: 2, mustContain: [] }],
        },
      ])
    ).toThrow(/mustContain/);
  });

  it("allows empty gold when passCriteria is set", () => {
    const [entry] = parseRetrievalCases([
      {
        id: "x",
        query: "SW-LWB-4",
        kind: "identifier",
        gold: [],
        passCriteria: "This ID is not in the corpus.",
        mustNotContainAnywhere: ["SW-LWB-4"],
      },
    ]);
    expect(entry!.gold).toEqual([]);
    expect(entry!.mustNotContainAnywhere).toEqual(["SW-LWB-4"]);
  });
});

describe("excerptContainsAny", () => {
  it("matches case-insensitively across OCR line breaks", () => {
    expect(
      excerptContainsAny("...Portable\nSpectrum Analyzer\nNarda...", [
        "Portable Spectrum Analyzer",
      ])
    ).toBe(true);
  });

  it("does not match when the term is absent", () => {
    expect(
      excerptContainsAny("Torque Wrench Sturtevant Richmont", [
        "Portable Spectrum Analyzer",
      ])
    ).toBe(false);
  });
});

describe("excerptHitAtK", () => {
  const gold = [
    {
      filename: "dv-protocol-equipment.pdf",
      page: 2,
      mustContain: ["Portable Spectrum Analyzer", "Narda"],
    },
  ];

  it("is null when no gold hit declares mustContain", () => {
    const results = [
      { filename: "dv-protocol-equipment.pdf", pageNumber: 2, text: "anything" },
    ];
    expect(
      excerptHitAtK(
        results,
        [{ filename: "dv-protocol-equipment.pdf", page: 2 }],
        5
      )
    ).toBeNull();
  });

  it("is 0 when the page is found but the excerpt is the wrong slice", () => {
    const results = [
      {
        filename: "dv-protocol-equipment.pdf",
        pageNumber: 2,
        text: "UUT HEADER TOP-EVAL-01 Cirtronics Serial pending Straight Handpiece lot 1 …",
      },
    ];
    expect(recallAtK(results, gold, 5)).toBe(1);
    expect(excerptHitAtK(results, gold, 5)).toBe(0);
  });

  it("scores 1 once the excerpt includes the answering row", () => {
    const results = [
      {
        filename: "dv-protocol-equipment.pdf",
        pageNumber: 2,
        text: "Required Testing Equipment Portable Spectrum Analyzer Narda SRM-3006 Oscilloscope",
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
        filename: "dv-protocol-equipment.pdf",
        pageNumber: 2,
        text: "Portable Spectrum Analyzer Narda",
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
