import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/attachments/retrieval", () => ({
  listReadyDocumentsForReport: vi.fn(),
  readDocumentOutline: vi.fn(),
  readDocumentPage: vi.fn(),
}));

import {
  listReadyDocumentsForReport,
  readDocumentOutline,
  readDocumentPage,
} from "@/lib/attachments/retrieval";
import {
  isRequirementIndexText,
  matchDocumentsByFilename,
  runScanAttachments,
  scanQueryTokens,
  scorePageContext,
  scorePageForScan,
  selectScoredPages,
  withPreviousPages,
} from "./scan-attachments";

const listReady = vi.mocked(listReadyDocumentsForReport);
const outline = vi.mocked(readDocumentOutline);
const readPage = vi.mocked(readDocumentPage);

describe("matchDocumentsByFilename", () => {
  it("matches live Seed-2 names and ignores unrelated BMRs", () => {
    const docs = [
      { attachmentId: "a", filename: "015-Seed-2 BMR.pdf" },
      { attachmentId: "b", filename: "016-Seed-2 BMR.pdf" },
      { attachmentId: "c", filename: "Innoculum Feed BMR.pdf" },
    ];
    expect(matchDocumentsByFilename(docs, "Seed-2").map((d) => d.attachmentId)).toEqual(
      ["a", "b"]
    );
  });
});

describe("scanQueryTokens / scorePageContext", () => {
  it("scores a 60 L fermenter log-sheet header above a glucose feed table", () => {
    const tokens = scanQueryTokens(
      "Table 01 Log sheet for Fermentation data sheet for 60 L"
    );
    const log = scorePageContext(
      "TABLE NO.- 01 - LOG SHEETS FOR 60 L FERMENTER (SEED 2)",
      tokens
    );
    const feed = scorePageContext("TABLE NO. 01 Glucose feed log", tokens);
    expect(log).toBeGreaterThan(feed);
    expect(log).toBeGreaterThan(0);
  });

  it("scores a transcript-only table title that is missing from pageContext", () => {
    const tokens = scanQueryTokens(
      "Table 01 Log sheet for Fermentation data sheet for 60 L"
    );
    const contextOnly = scorePageForScan(
      { pageContext: "fermentation overview", transcript: "" },
      tokens
    );
    const transcriptOnly = scorePageForScan(
      {
        pageContext: "cover sheet",
        transcript: "TABLE NO.- 01 - LOG SHEETS FOR 60 L FERMENTER (SEED 2)",
      },
      tokens
    );
    expect(transcriptOnly).toBeGreaterThan(contextOnly);
    expect(transcriptOnly).toBeGreaterThan(0);
  });

  it("keeps a requirement ID as one token", () => {
    expect(scanQueryTokens("extract M3-SYS-FN-037")).toEqual([
      "m3-sys-fn-037",
      "extract",
    ]);
  });

  it("treats a running header of many requirement IDs as an index page", () => {
    expect(
      isRequirementIndexText(
        "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046"
      )
    ).toBe(true);
    expect(isRequirementIndexText("Mist volume M3-SYS-FN-037")).toBe(false);
  });

  it("demotes TOC/header pageContext when scoring a requirement-ID scan", () => {
    const tokens = scanQueryTokens("M3-SYS-FN-037");
    const header = scorePageForScan(
      {
        pageContext:
          "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046",
        transcript: "TABLE OF CONTENTS BACKGROUND",
      },
      tokens
    );
    const data = scorePageForScan(
      {
        pageContext: "Mist volume data sheet",
        transcript:
          "M3-SYS-FN-037 Aim the handpiece nozzle. Volume collected 5.2 6.1 7.0 mL/min",
      },
      tokens
    );
    expect(data).toBeGreaterThan(header);
  });

  it("does not score a transcript that is only a requirement-ID list", () => {
    const tokens = scanQueryTokens("M3-SYS-FN-037");
    expect(
      scorePageForScan(
        {
          pageContext: "cover",
          transcript:
            "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046",
        },
        tokens
      )
    ).toBe(0);
  });
});

describe("withPreviousPages", () => {
  it("includes the prior page so split table headers are kept", () => {
    expect(withPreviousPages([31], 12)).toEqual([30, 31]);
  });
});

describe("selectScoredPages", () => {
  it("fills the budget from the highest-scoring pages, not document order", () => {
    expect(
      selectScoredPages(
        [
          { pageNumber: 2, score: 1 },
          { pageNumber: 20, score: 10 },
        ],
        2
      )
    ).toEqual([19, 20]);
  });
});

describe("runScanAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listReady.mockResolvedValue([
      {
        attachmentId: "seed-16",
        filename: "016-Seed-2 BMR.pdf",
        description: null,
        pageCount: 40,
        ingestRunId: "run-1",
        documentSummary: null,
      },
      {
        attachmentId: "feed",
        filename: "Innoculum Feed BMR.pdf",
        description: null,
        pageCount: 20,
        ingestRunId: "run-2",
        documentSummary: null,
      },
    ]);
    outline.mockImplementation(async ({ attachmentId }) => {
      if (attachmentId !== "seed-16") return null;
      return {
        attachmentId: "seed-16",
        filename: "016-Seed-2 BMR.pdf",
        description: null,
        pageCount: 40,
        documentSummary: null,
        pages: [
          {
            pageNumber: 11,
            printedPageLabel: null,
            pageContext: "Bill of materials 60 L mention",
          },
          {
            pageNumber: 31,
            printedPageLabel: null,
            pageContext: "TABLE NO.- 01 - LOG SHEETS FOR 60 L FERMENTER (SEED 2)",
          },
        ],
        spans: [
          { title: "Fermenter log sheets", pageStart: 31, pageEnd: 31 },
        ],
      };
    });
    readPage.mockImplementation(async ({ pageNumber }) => ({
      attachmentId: "seed-16",
      filename: "016-Seed-2 BMR.pdf",
      description: null,
      pageNumber,
      printedPageLabel: null,
      transcript: `page ${pageNumber} table body`,
      visualInterpretation: "",
      pageContext: "TABLE NO.- 01",
      ingestRunId: "run-1",
    }));
  });

  it("outlines matching files and reads the scored log-sheet pages in one call", async () => {
    const result = await runScanAttachments({
      reportId: "report-1",
      filenameContains: "Seed-2",
      query: "TABLE NO 01 LOG SHEETS FOR 60 L FERMENTER",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.filename).toBe("016-Seed-2 BMR.pdf");
    const pages = result.files[0]?.pages.map((p) => p.pageNumber) ?? [];
    expect(pages).toContain(30);
    expect(pages).toContain(31);
    expect(outline).toHaveBeenCalledTimes(1);
  });

  it("selects a page whose table title is only in the transcript", async () => {
    outline.mockResolvedValue({
      attachmentId: "seed-16",
      filename: "016-Seed-2 BMR.pdf",
      description: null,
      pageCount: 40,
      documentSummary: null,
      pages: [
        {
          pageNumber: 1,
          printedPageLabel: null,
          pageContext: "cover sheet",
          transcript: "title page",
        },
        {
          pageNumber: 18,
          printedPageLabel: null,
          pageContext: "fermentation overview",
          transcript:
            "TABLE NO.- 01 - LOG SHEETS FOR 60 L FERMENTER (SEED 2)\nTime Age Temp RPM",
        },
      ],
      spans: [{ title: "Cover", pageStart: 1, pageEnd: 1 }],
    });
    const result = await runScanAttachments({
      reportId: "report-1",
      filenameContains: "Seed-2",
      query: "TABLE NO 01 LOG SHEETS FOR 60 L FERMENTER",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const pages = result.files[0]?.pages.map((p) => p.pageNumber) ?? [];
    expect(pages).toContain(18);
  });

  it("refuses an empty locator", async () => {
    await expect(runScanAttachments({ reportId: "report-1" })).resolves.toMatchObject({
      status: "need_locator",
    });
  });
});
