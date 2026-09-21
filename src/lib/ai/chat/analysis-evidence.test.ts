import { describe, expect, it } from "vitest";
import {
  analysisEvidence,
  analysisEvidenceForReport,
  analysisSupportingFact,
} from "./analysis-evidence";
import { extractHardFacts } from "./claim-facts";
import { CitationPageLedger } from "./citation-grounding";
import { groundDraftText } from "./ground-draft";
import type {
  StatisticalAnalysisSummary,
  TimeSeriesAnalysisSummary,
} from "@/lib/statistical-analysis/types";

function timeSeries(
  over: Partial<TimeSeriesAnalysisSummary["results"]> = {}
): TimeSeriesAnalysisSummary {
  return {
    id: "an-1",
    workspaceId: "ws-1",
    kind: "time_series",
    title: "VAC1 over time",
    sourceHash: "hash",
    stale: false,
    createdAt: "2026-05-23T00:00:00.000Z",
    previewImage: null,
    config: {
      columnId: "c1",
      columnName: "VAC1",
      timeColumnId: "c2",
      timeColumnName: "DATE",
      clockColumnId: "c3",
      clockColumnName: "TIME",
      title: "VAC1 over time",
      lsl: 650,
      usl: 950,
    },
    results: {
      specs: [],
      n: 2142,
      skipped: 0,
      points: [],
      decimated: true,
      start: 0,
      end: 1,
      min: 192.4,
      max: 951.2,
      mean: 801.5,
      excursions: [
        {
          startLabel: "22/05/2026 20:59:11",
          endLabel: "22/05/2026 21:06:11",
          startRow: 300,
          endRow: 307,
          readings: 8,
          elapsedMs: 420_000,
          elapsedMinutes: 7,
          elapsedClock: "0:07:00",
          min: 192.4,
          max: 649.1,
          direction: "low",
          lsl: 650,
          usl: 950,
          condition: "800",
        },
      ],
      excursionReadings: 8,
      bandSegments: [],
      ...over,
    },
  };
}

function factFor(text: string) {
  const facts = extractHardFacts(text);
  expect(facts.length).toBeGreaterThan(0);
  return facts[0]!;
}

describe("analysisEvidence", () => {
  it("stands behind the values a time series computed", () => {
    const evidence = analysisEvidence(timeSeries());
    for (const value of ["8", "7", "192.4", "2142", "0:07:00"]) {
      expect(evidence.values.has(value)).toBe(true);
    }
  });

  it("does not stand behind the limits the engineer typed", () => {
    // LSL/USL are configuration, not something the analysis verified.
    const evidence = analysisEvidence(timeSeries());
    expect(evidence.values.has("650")).toBe(false);
    expect(evidence.values.has("950")).toBe(false);
  });
});

describe("analysisSupportingFact", () => {
  const evidence = [analysisEvidence(timeSeries())];

  it("matches a duration the analysis computed, whatever the unit spelling", () => {
    expect(analysisSupportingFact(factFor("7 minutes"), evidence)).not.toBeNull();
    expect(analysisSupportingFact(factFor("7 min"), evidence)).not.toBeNull();
  });

  it("matches a measured extreme the analysis computed", () => {
    expect(
      analysisSupportingFact(factFor("192.4 µbar"), evidence)
    ).not.toBeNull();
  });

  it("does not match a number the analysis did not compute", () => {
    // The whole point: a contradicting figure gets no backing.
    expect(analysisSupportingFact(factFor("9 minutes"), evidence)).toBeNull();
    expect(analysisSupportingFact(factFor("180.0 µbar"), evidence)).toBeNull();
  });

  it("never backs a date or an identifier", () => {
    // An analysis computes quantities, not document numbers.
    const date = extractHardFacts("on 22/05/2026")[0]!;
    expect(analysisSupportingFact(date, evidence)).toBeNull();
    const id = extractHardFacts("SOP/QA/017 R08")[0]!;
    expect(analysisSupportingFact(id, evidence)).toBeNull();
  });

  it("returns nothing when there are no analyses", () => {
    expect(analysisSupportingFact(factFor("7 minutes"), [])).toBeNull();
  });
});

describe("analysisEvidenceForReport", () => {
  it("carries the source pages of the columns the analysis read", () => {
    const analysis = timeSeries();
    const [evidence] = analysisEvidenceForReport({
      worksheet: {
        columns: [],
        specs: [],
        activeSheetId: "data-1",
        sheets: [
          {
            id: "data-1",
            name: "RIG25014",
            columns: [
              {
                id: "c1",
                name: "VAC1",
                values: [],
                citations: [
                  { attachmentId: "a1", page: 12, filename: "trend.pdf" },
                  { attachmentId: "a1", page: 13, filename: "trend.pdf" },
                ],
              },
              {
                id: "c2",
                name: "DATE",
                values: [],
                citations: [
                  { attachmentId: "a1", page: 12, filename: "trend.pdf" },
                ],
              },
            ],
          },
        ],
      },
      analyses: [analysis as StatisticalAnalysisSummary],
    });
    expect(evidence?.pages).toEqual([
      { filename: "trend.pdf", page: 12 },
      { filename: "trend.pdf", page: 13 },
    ]);
  });
});

describe("groundDraftText with analysis evidence", () => {
  function ledgerWith(quote: string): CitationPageLedger {
    const ledger = new CitationPageLedger();
    ledger.record("trend.pdf", 12, "a1", { quote });
    return ledger;
  }

  it("blocks a derived value when no analysis stands behind it", () => {
    // Establishes the baseline the exemption is measured against.
    const result = groundDraftText({
      text: "The vacuum was out of band for 7 minutes [trend.pdf, p. 12].",
      ledger: ledgerWith("22/05/2026 20:59:11 192.4"),
      policy: "block",
    });
    expect(result.blocked).toBe(true);
  });

  it("writes that same value once a saved analysis computed it", () => {
    const result = groundDraftText({
      text: "The vacuum was out of band for 7 minutes [trend.pdf, p. 12].",
      ledger: ledgerWith("22/05/2026 20:59:11 192.4"),
      policy: "block",
      analyses: [
        analysisEvidence(timeSeries(), [{ filename: "trend.pdf", page: 12 }]),
      ],
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("7 minutes");
    const claim = result.provenance.claims.find(
      (record) => record.text === "7 minutes"
    );
    expect(claim?.status).toBe("verified");
    expect(claim?.analysis).toMatchObject({
      analysisId: "an-1",
      title: "VAC1 over time",
      pages: [{ filename: "trend.pdf", page: 12 }],
    });
  });

  it("still blocks a number that contradicts the analysis it cites", () => {
    const result = groundDraftText({
      text: "The vacuum was out of band for 87 minutes [trend.pdf, p. 12].",
      ledger: ledgerWith("22/05/2026 20:59:11 192.4"),
      policy: "block",
      analyses: [analysisEvidence(timeSeries())],
    });
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("87 minutes");
  });

  it("leaves a value printed on the page verified by the page, not the analysis", () => {
    const result = groundDraftText({
      text: "The low reading was 192.4 µbar [trend.pdf, p. 12].",
      ledger: ledgerWith("22/05/2026 20:59:11 192.4"),
      policy: "block",
      analyses: [analysisEvidence(timeSeries())],
    });
    expect(result.blocked).toBe(false);
    const claim = result.provenance.claims.find((record) =>
      record.text.startsWith("192.4")
    );
    expect(claim?.source).toMatchObject({ filename: "trend.pdf", page: 12 });
    expect(claim?.analysis ?? null).toBeNull();
  });
});
