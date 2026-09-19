import { describe, expect, it } from "vitest";
import {
  buildMatchCenteredSnippet,
  classifyRetrievalQuery,
  collapseToBestChunkPerPage,
  contentQueryForSnippet,
  diversifyHitsByFile,
  lexicalMatchScore,
  lexicalQueryTokens,
  localTokenIdfWeights,
  rankHitsForQuery,
  requestedPageNumbers,
  rerankHitsForQuery,
  takeRankedHits,
  locatorHitBoost,
} from "./retrieval-query";

describe("classifyRetrievalQuery", () => {
  it("extracts requirement-like identifiers", () => {
    expect(classifyRetrievalQuery("Where is SW-LWB-4 listed?")).toEqual({
      kind: "identifier",
      identifiers: ["SW-LWB-4"],
    });
  });

  it("treats page and filename wording as locators when no id is present", () => {
    expect(
      classifyRetrievalQuery("appendix-b-790-00134r-revu.pdf page 31").kind
    ).toBe("locator");
  });

  it("does not treat dissolution prose as an identifier", () => {
    expect(classifyRetrievalQuery("dissolution failure")).toEqual({
      kind: "semantic",
      identifiers: [],
    });
  });

  it("does not treat B-441 as a requirement id", () => {
    expect(classifyRetrievalQuery("Batch B-441 failed dissolution").kind).toBe(
      "semantic"
    );
  });

  it("treats MJ slash document numbers as identifiers", () => {
    expect(classifyRetrievalQuery("PMC/PR/014")).toEqual({
      kind: "identifier",
      identifiers: ["PMC/PR/014"],
    });
    expect(classifyRetrievalQuery("Where is SOP/DP/QA/014 cited?").kind).toBe(
      "identifier"
    );
  });
});

describe("lexicalQueryTokens", () => {
  it("drops punctuation-only tokens", () => {
    expect(lexicalQueryTokens("logic analyzer ???")).toEqual([
      "logic",
      "analyzer",
    ]);
  });
});

describe("lexicalMatchScore", () => {
  it("prefers phrase matches over single-token overlap", () => {
    const phrase = lexicalMatchScore(
      "Table 3 Required Testing Equipment Logic Analyzer Saleae",
      "logic analyzer"
    );
    const single = lexicalMatchScore(
      "logic board calibration",
      "logic analyzer"
    );
    expect(phrase).toBeGreaterThan(single);
  });

  it("does not treat filling or ASEPTIC PROCESSING as a Media Fill hit", () => {
    const buried = lexicalMatchScore(
      "Media fill / APS run MF/DP/25/001 completed with zero contaminated units.",
      "Media Fill"
    );
    const magnet = lexicalMatchScore(
      "STERILINE ASEPTIC PROCESSING IQ filter certification filling line.",
      "Media Fill"
    );
    expect(buried).toBeGreaterThan(magnet);
    expect(magnet).toBe(0);
  });

  it("does not match MF as a substring of S.No MF Project ID", () => {
    expect(
      lexicalMatchScore("S.No MF Project ID alarm log", "APS")
    ).toBe(0);
  });
});

describe("buildMatchCenteredSnippet", () => {
  it("centers the excerpt on the query phrase instead of the page header", () => {
    const pageText =
      "TOP-00051 Equipment Description Model 3 Design Verification Protocol ".repeat(
        8
      ) + "Table 3 Required Testing Equipment Logic Analyzer Saleae Oscilloscope";

    const snippet = buildMatchCenteredSnippet(pageText, "logic analyzer", 120);

    expect(snippet).toContain("Logic Analyzer");
    expect(snippet).toContain("Saleae");
    expect(snippet.startsWith("TOP-00051")).toBe(false);
  });

  it("falls back to head truncation when nothing matches", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    expect(buildMatchCenteredSnippet(text, "missing term", 20)).toBe(
      "alpha beta gamma del..."
    );
  });

  it("uses the page tail for a file+page locator so running headers do not fill the window", () => {
    const pageText =
      "UUT HEADER repeating boilerplate for search excerpt truncation ".repeat(
        30
      ) + "Required Testing Equipment Narda SRM-3006";
    const snippet = buildMatchCenteredSnippet(
      pageText,
      "dv-protocol-equipment.pdf page 2",
      120
    );
    expect(snippet).toContain("Required Testing Equipment");
    expect(snippet).toContain("Narda SRM-3006");
  });
});

describe("collapseToBestChunkPerPage", () => {
  it("keeps the first chunk per attachment page when no query is provided", () => {
    const collapsed = collapseToBestChunkPerPage([
      { attachmentId: "a", pageNumber: 1, chunkId: "c1", text: "header" },
      { attachmentId: "a", pageNumber: 1, chunkId: "c2", text: "Logic Analyzer" },
      { attachmentId: "a", pageNumber: 2, chunkId: "c3", text: "other" },
    ]);
    expect(collapsed.map((row) => row.chunkId)).toEqual(["c1", "c3"]);
  });

  it("keeps the chunk whose text best matches the query", () => {
    const collapsed = collapseToBestChunkPerPage(
      [
        {
          attachmentId: "a",
          pageNumber: 121,
          chunkId: "c1",
          text: "TOP-00051 UUT header boilerplate",
        },
        {
          attachmentId: "a",
          pageNumber: 121,
          chunkId: "c2",
          text: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
        },
        {
          attachmentId: "a",
          pageNumber: 122,
          chunkId: "c3",
          text: "next page",
        },
      ],
      {
        query: "logic analyzer",
        textFrom: (row) => row.text,
      }
    );
    expect(collapsed.map((row) => row.chunkId)).toEqual(["c2", "c3"]);
  });

  it("keeps a quote chunk over a visual-interpretation summary on the same page", () => {
    const collapsed = collapseToBestChunkPerPage(
      [
        {
          attachmentId: "a",
          pageNumber: 3,
          chunkId: "visual",
          sourceKind: "visual_interpretation",
          text: "this page lists which instruments appear on the executed equipment data table",
        },
        {
          attachmentId: "a",
          pageNumber: 3,
          chunkId: "quote",
          sourceKind: "quote",
          text: "EXECUTED Equipment Data Table Torque Wrench Sturtevant Digital Calipers",
        },
      ],
      {
        query: "which instruments appear on the executed equipment data table",
        textFrom: (row) => row.text,
      }
    );
    expect(collapsed.map((row) => row.chunkId)).toEqual(["quote"]);
  });
});

describe("locator ranking", () => {
  it("parses page numbers and strips locator tokens from snippet queries", () => {
    expect(requestedPageNumbers("dv-protocol-equipment.pdf page 2")).toEqual([
      2,
    ]);
    expect(contentQueryForSnippet("dv-protocol-equipment.pdf page 2")).toBe("");
  });

  it("ranks the requested file page ahead of earlier pages of the same file", () => {
    const ranked = rankHitsForQuery(
      [
        { filename: "dv-protocol-equipment.pdf", pageNumber: 1, id: "p1" },
        { filename: "dv-protocol-equipment.pdf", pageNumber: 2, id: "p2" },
        { filename: "software-requirements.pdf", pageNumber: 2, id: "other" },
      ],
      "dv-protocol-equipment.pdf page 2"
    );
    expect(ranked.map((row) => row.id)).toEqual(["p2", "p1", "other"]);
  });

  it("boosts the stored PDF page, not a printed footer number in the excerpt", () => {
    const footerOnAbsolute118 = {
      filename: "protocol.pdf",
      pageNumber: 118,
      excerpt: "Page 104 of 250 Purpose and scope of this design verification.",
      id: "abs-118",
    };
    const storedPage104 = {
      filename: "protocol.pdf",
      pageNumber: 104,
      excerpt: "Unrelated table of contents.",
      id: "abs-104",
    };
    expect(locatorHitBoost(footerOnAbsolute118, "protocol.pdf page 104")).toBe(
      2
    );
    expect(locatorHitBoost(storedPage104, "protocol.pdf page 104")).toBe(3);
    expect(
      rankHitsForQuery(
        [footerOnAbsolute118, storedPage104],
        "protocol.pdf page 104"
      ).map((row) => row.id)
    ).toEqual(["abs-104", "abs-118"]);
  });
});

describe("rerankHitsForQuery", () => {
  it("promotes a hit whose excerpt names the identifier", () => {
    const ranked = rerankHitsForQuery(
      [
        {
          filename: "other.pdf",
          pageNumber: 1,
          excerpt: "unrelated equipment table header",
          id: "noise",
        },
        {
          filename: "software-requirements.pdf",
          pageNumber: 2,
          excerpt: "SW-EVAL-7 Laser interlock latency Pass",
          id: "hit",
        },
      ],
      "SW-EVAL-7"
    );
    expect(ranked.map((row) => row.id)).toEqual(["hit", "noise"]);
  });

  it("keeps original order when scores tie", () => {
    const ranked = rerankHitsForQuery(
      [
        { filename: "a.pdf", pageNumber: 1, excerpt: "alpha", id: "first" },
        { filename: "b.pdf", pageNumber: 2, excerpt: "alpha", id: "second" },
      ],
      "dissolution failure"
    );
    expect(ranked.map((row) => row.id)).toEqual(["first", "second"]);
  });
});

describe("localTokenIdfWeights", () => {
  it("dampens tokens that appear on every candidate", () => {
    const haystacks = [
      "equipment system report cover",
      "equipment system report header",
      "equipment system report index",
      "Narda SRM-3006 spectrum analyzer on the equipment list",
    ];
    const weights = localTokenIdfWeights(haystacks, "Narda equipment");
    expect(weights.get("narda") ?? 0).toBeGreaterThan(weights.get("equipment") ?? 0);
  });
});

describe("IDF rerank", () => {
  it("promotes a rare vendor over a cover that only repeats common tokens", () => {
    const ranked = rerankHitsForQuery(
      [
        {
          filename: "dv-protocol-equipment.pdf",
          pageNumber: 1,
          excerpt: "equipment system report cover equipment system report",
          id: "cover",
        },
        {
          filename: "dv-protocol-equipment.pdf",
          pageNumber: 2,
          excerpt: "Narda SRM-3006 Portable Spectrum Analyzer",
          id: "gold",
        },
        {
          filename: "software-requirements.pdf",
          pageNumber: 1,
          excerpt: "equipment system report software cover",
          id: "soft-cover",
        },
        {
          filename: "other.pdf",
          pageNumber: 1,
          excerpt: "equipment calibration system report",
          id: "other",
        },
      ],
      "Narda equipment"
    );
    expect(ranked[0]?.id).toBe("gold");
    const unweightedCover = lexicalMatchScore(
      "equipment system report cover equipment system report",
      "Narda equipment"
    );
    const unweightedGold = lexicalMatchScore(
      "Narda SRM-3006 Portable Spectrum Analyzer",
      "Narda equipment"
    );
    expect(unweightedCover).toBeGreaterThan(unweightedGold);
  });
});

describe("diversifyHitsByFile", () => {
  it("keeps at most two hits per file in the top limit", () => {
    const rows = [
      { filename: "long.pdf", id: "a1" },
      { filename: "long.pdf", id: "a2" },
      { filename: "long.pdf", id: "a3" },
      { filename: "other.pdf", id: "b1" },
      { filename: "long.pdf", id: "a4" },
    ];
    expect(diversifyHitsByFile(rows, 8).map((row) => row.id)).toEqual([
      "a1",
      "a2",
      "b1",
    ]);
  });
});

describe("takeRankedHits", () => {
  it("does not cap a locator query to two pages of the named file", () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      filename: "dv-protocol-equipment.pdf",
      pageNumber: index + 1,
      excerpt: `page ${index + 1}`,
      id: `p${index + 1}`,
    }));
    const taken = takeRankedHits(rows, "dv-protocol-equipment.pdf page 2", 4);
    expect(taken.map((row) => row.id)[0]).toBe("p2");
    expect(taken).toHaveLength(4);
  });

  it("caps semantic results per file so one attachment cannot fill the limit", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, index) => ({
        filename: "long.pdf",
        pageNumber: index + 1,
        excerpt: "equipment system report",
        id: `long-${index + 1}`,
      })),
      {
        filename: "other.pdf",
        pageNumber: 2,
        excerpt: "equipment system report table",
        id: "other-2",
      },
    ];
    expect(takeRankedHits(rows, "equipment system report", 8).map((row) => row.id)).toEqual([
      "long-1",
      "long-2",
      "other-2",
    ]);
  });
});
