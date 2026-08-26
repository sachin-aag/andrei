import { describe, expect, it, vi } from "vitest";
import {
  M3_SYS_FN_037_ATTACHMENT_ID,
  M3_SYS_FN_037_FILENAME,
  M3_SYS_FN_037_LIMITS,
  M3_SYS_FN_037_PAGE,
  M3_SYS_FN_037_TRANSCRIPT,
  M3_SYS_FN_037_UOM,
  m3SysFn037ExtractedRows,
} from "@/lib/charts/__fixtures__/m3-sys-fn-037-transcript";
import {
  P1_PUW_COMBINED_TRANSCRIPT,
  P1_PUW_FILENAME,
} from "@/lib/extraction/__fixtures__/p1-puw-qualification-phase-ii";
import {
  buildChartSpec,
  extractMeasurements,
  extractNumberTokens,
} from "@/lib/charts/extract-measurements";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/retrieval", () => ({
  searchReportDocuments: vi.fn(),
  readDocumentPage: vi.fn(),
}));

const PAGE = {
  attachmentId: M3_SYS_FN_037_ATTACHMENT_ID,
  filename: M3_SYS_FN_037_FILENAME,
  description: null,
  pageNumber: M3_SYS_FN_037_PAGE,
  printedPageLabel: null,
  transcript: M3_SYS_FN_037_TRANSCRIPT,
  visualInterpretation: "do not validate against this",
  pageContext: null,
  ingestRunId: "run_1",
};

describe("extractNumberTokens", () => {
  it("does not treat 3 as a match inside 13 or 3.1", () => {
    expect(extractNumberTokens("13 and 3.1 and 3")).toEqual(["13", "3.1", "3"]);
  });
});

describe("extractMeasurements", () => {
  it("gates the 30-row M3-SYS-FN-037 fixture", async () => {
    const rows = m3SysFn037ExtractedRows();
    expect(rows).toHaveLength(30);
    const result = await extractMeasurements({
      reportId: "r1",
      query: "M3-SYS-FN-037",
      search: async () => [
        {
          attachmentId: M3_SYS_FN_037_ATTACHMENT_ID,
          filename: M3_SYS_FN_037_FILENAME,
          description: null,
          pageNumber: M3_SYS_FN_037_PAGE,
          chunkId: "c1",
          sourceKind: "pdf",
          text: "snippet",
          quote: "snippet",
          citationId: "cit_1",
          ingestRunId: "run_1",
        },
      ],
      readPage: async () => PAGE,
      extractRows: async () => ({
        rows,
        limits: {
          lower: String(M3_SYS_FN_037_LIMITS.lower),
          upper: String(M3_SYS_FN_037_LIMITS.upper),
        },
        sampleSizeMin: 29,
      }),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rows).toHaveLength(30);
    expect(result.uom).toBe(M3_SYS_FN_037_UOM);
    expect(result.limits).toEqual({ lower: 1, upper: 6 });
  });

  it("rejects a rounded value that is not an exact page token", async () => {
    const rows = m3SysFn037ExtractedRows();
    rows[0] = { ...rows[0]!, value: "4.3" };
    const result = await extractMeasurements({
      reportId: "r1",
      query: "M3-SYS-FN-037",
      search: async () => [
        {
          attachmentId: M3_SYS_FN_037_ATTACHMENT_ID,
          filename: M3_SYS_FN_037_FILENAME,
          description: null,
          pageNumber: M3_SYS_FN_037_PAGE,
          chunkId: "c1",
          sourceKind: "pdf",
          text: "snippet",
          quote: "snippet",
          citationId: "cit_1",
          ingestRunId: "run_1",
        },
      ],
      readPage: async () => PAGE,
      extractRows: async () => ({
        rows,
        limits: { lower: "1", upper: "6" },
        sampleSizeMin: 29,
      }),
    });
    expect(result.status).toBe("unverified");
  });

  it("assigns x only in buildChartSpec", () => {
    const extraction = {
      status: "ok" as const,
      query: "M3-SYS-FN-037",
      rows: m3SysFn037ExtractedRows().slice(0, 2).map((row) => ({
        ...row,
        numericValue: Number(row.value),
      })),
      limits: { lower: 1, upper: 6 },
      uom: "ozf-in",
      sampleSizeMin: 29,
      citations: [{ attachmentId: M3_SYS_FN_037_ATTACHMENT_ID, page: M3_SYS_FN_037_PAGE }],
    };
    const spec = buildChartSpec({
      query: "M3-SYS-FN-037",
      title: "Tip Detachment Torque",
      xLabel: "Measurement",
      yLabel: "Torque (ozf-in)",
      layout: DEFAULT_CHART_LAYOUT,
      extraction,
    });
    expect(spec.points.map((p) => p.x)).toEqual([1, 2]);
  });

  it("refuses an OR-list query without reading pages", async () => {
    const result = await extractMeasurements({
      reportId: "r1",
      query: "Conductivity or TOC or Level",
      search: async () => {
        throw new Error("search should not run");
      },
      readPage: async () => {
        throw new Error("read should not run");
      },
      extractRows: async () => {
        throw new Error("extract should not run");
      },
    });
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") return;
    expect(result.message).toMatch(/exactly one measurement series/i);
  });

  it("fails closed on the water PDF dual unlabeled RESULT columns", async () => {
    const result = await extractMeasurements({
      reportId: "r1",
      query: "Conductivity",
      search: async () => [
        {
          attachmentId: "puw",
          filename: P1_PUW_FILENAME,
          description: null,
          pageNumber: 1,
          chunkId: "c1",
          sourceKind: "pdf",
          text: "snippet",
          quote: "snippet",
          citationId: "cit_1",
          ingestRunId: "run_1",
        },
      ],
      readPage: async () => ({
        attachmentId: "puw",
        filename: P1_PUW_FILENAME,
        description: null,
        pageNumber: 1,
        printedPageLabel: null,
        transcript: P1_PUW_COMBINED_TRANSCRIPT,
        visualInterpretation: "",
        pageContext: null,
        ingestRunId: "run_1",
      }),
      extractRows: async () => {
        throw new Error("extract should not run on unbound dual series");
      },
    });
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") return;
    expect(result.message).toMatch(/unlabeled RESULT/i);
  });
});
