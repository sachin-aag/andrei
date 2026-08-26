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
  matchDocumentsByFilename,
  runScanAttachments,
  scanQueryTokens,
  scorePageContext,
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
});

describe("withPreviousPages", () => {
  it("includes the prior page so split table headers are kept", () => {
    expect(withPreviousPages([31], 12)).toEqual([30, 31]);
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
    expect(result.files[0]?.pages.map((p) => p.pageNumber)).toEqual([30, 31]);
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(outline).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty locator", async () => {
    await expect(runScanAttachments({ reportId: "report-1" })).resolves.toMatchObject({
      status: "need_locator",
    });
  });
});
