import { beforeEach, describe, expect, it, vi } from "vitest";
import { comments, reportSections } from "@/db/schema";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  DocumentReviewSession,
  extractReviewFindingsFromPages,
} from "@/lib/ai/chat/document-review";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { emptyQsrContent } from "@/lib/document-types/qsr/sections";
import type { QsrSectionKey } from "@/lib/document-types/qsr/sections";
import type { TableOperation } from "@/lib/suggestions/table-operation";

/**
 * Production-incident replay for QSR section 5 (GLR-1301 / `qsr 2`).
 *
 * Playwright stub chat cannot assert tool selection. Live Gemini is not in
 * this repo. The layer that would have caught the overblock is: seed an
 * empty QSR table, attach the URS, call the same tools the model called,
 * and assert `edit_table` proposes the live cell text instead of bouncing.
 *
 * Copy this file for the next grounding incident. Do not add these cases
 * to `tools.test.ts`. `restoreFromFinishedReview` zeros skip counts — use a
 * real start → continue → finish when the bug is a skipped-file lock.
 */
const {
  readDocumentPageMock,
  listReadyDocumentsForReportMock,
  listDocumentPagesForReviewMock,
  loadDocumentPageEvidenceMock,
  searchReportDocumentsManyMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
  getReportAnalyticsMock,
} = vi.hoisted(() => ({
  readDocumentPageMock: vi.fn(),
  listReadyDocumentsForReportMock: vi.fn(),
  listDocumentPagesForReviewMock: vi.fn(),
  loadDocumentPageEvidenceMock: vi.fn(),
  searchReportDocumentsManyMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  getReportAnalyticsMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
  },
}));

vi.mock("@/lib/attachments/retrieval", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/attachments/retrieval")>();
  return {
    ...actual,
    readDocumentPage: (...args: unknown[]) =>
      readDocumentPageMock(...(args as [])),
    listReadyDocumentsForReport: (...args: unknown[]) =>
      listReadyDocumentsForReportMock(...(args as [])),
    listDocumentPagesForReview: (...args: unknown[]) =>
      listDocumentPagesForReviewMock(...(args as [])),
    loadDocumentPageEvidence: (...args: unknown[]) =>
      loadDocumentPageEvidenceMock(...(args as [])),
    searchReportDocumentsMany: (...args: unknown[]) =>
      searchReportDocumentsManyMock(...(args as [])),
  };
});

vi.mock("@/lib/statistical-analysis/store", () => ({
  getReportAnalytics: (...args: unknown[]) => getReportAnalyticsMock(...args),
}));

const URS_FILENAME = "User Requirement Specification.PDF";
const URS_ID = "att_urs";
const DQ_FILENAME = "Design Qualification.PDF";
const DQ_ID = "att_dq";
const IQ_FILENAME = "Installation Qualification.PDF";
const IQ_ID = "att_iq";
const REPORT_ID = "report-qsr-rtm";

const COVER_QUOTE =
  "Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301 Page 1 of 12";
const VACUUM_QUOTE =
  "Vacuum gauge to measure the vacuum produced. Range 0 to 760 mmHg. URS-36 Pressure Gauge for the shell.";
const MOC_QUOTE =
  "URS-39 Contact parts of the equipment shall be Glass lined / SS 316L.";
const NEIGHBOUR_QUOTE =
  "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel. URS-44 Emergency Stop push button at each station.";
const COLUMN_QUOTE =
  "URS ID # Parameters User requirements URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-4 Shell Operating pressure URS-12 Jacket MOC Format. No.:-QAD-SOP-FS-003-F03-00 8000 L High-quality Glass Lining and thickness should not be less than 1 mm 15 °C to 130 °C Full Vacuum to 3.5 Kg/cm²";

const URS_PAGES: Record<
  number,
  { transcript: string; visualInterpretation: string }
> = {
  1: { transcript: COVER_QUOTE, visualInterpretation: "" },
  4: { transcript: NEIGHBOUR_QUOTE, visualInterpretation: "" },
  6: { transcript: COLUMN_QUOTE, visualInterpretation: "" },
  8: { transcript: `URS-35 ${VACUUM_QUOTE}`, visualInterpretation: "" },
  9: { transcript: MOC_QUOTE, visualInterpretation: "" },
  12: {
    transcript: "URS-62 Heat Transfer Area NLT 25.0 m² for the jacket.",
    visualInterpretation: "",
  },
};

const TEST_TOOL_OPTIONS = {
  toolCallId: "test",
  messages: [],
  abortSignal: new AbortController().signal,
};

const ACTOR = {
  id: "engineer-1",
  name: "Engineer",
  role: "engineer" as const,
};

function ursDoc(pageCount = 12) {
  return {
    attachmentId: URS_ID,
    filename: URS_FILENAME,
    description: null,
    pageCount,
    ingestRunId: "run",
    documentSummary: null,
  };
}

function dqDoc(pageCount = 40) {
  return {
    attachmentId: DQ_ID,
    filename: DQ_FILENAME,
    description: null,
    pageCount,
    ingestRunId: "run",
    documentSummary: null,
  };
}

function iqDoc(pageCount = 60) {
  return {
    attachmentId: IQ_ID,
    filename: IQ_FILENAME,
    description: null,
    pageCount,
    ingestRunId: "run",
    documentSummary: null,
  };
}

function mockSection(section: QsrSectionKey) {
  dbSelectMock.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: vi.fn().mockResolvedValue(
        table === comments
          ? []
          : table === reportSections
            ? [
                {
                  id: `sec-${section}`,
                  reportId: REPORT_ID,
                  section,
                  content: emptyQsrContent(section),
                },
              ]
            : []
      ),
    }),
  }));
}

function matchingRtmReview() {
  const session = new DocumentReviewSession();
  session.restoreFromFinishedReview({
    coverageKey: `${URS_ID}:12:run|obj:qsr_rtm`,
  });
  return session;
}

function buildTools(input: {
  section: QsrSectionKey;
  documentReview?: DocumentReviewSession;
}) {
  return buildChatTools({
    reportId: REPORT_ID,
    canEdit: true,
    actor: ACTOR,
    documentType: "qualification_summary_report",
    sectionScope: input.section,
    reviewCoverageObjective: input.section,
    documentReview: input.documentReview ?? matchingRtmReview(),
    unsupportedFactPolicy: "block",
    retrievalPolicy: "adaptive",
  });
}

async function readUrsPage(
  tools: ReturnType<typeof buildChatTools>,
  pageNumber: number
) {
  const page = URS_PAGES[pageNumber];
  if (!page) throw new Error(`No URS fixture for page ${pageNumber}`);
  readDocumentPageMock.mockResolvedValueOnce({
    attachmentId: URS_ID,
    filename: URS_FILENAME,
    pageNumber,
    transcript: page.transcript,
    visualInterpretation: page.visualInterpretation,
    pageContext: null,
    printedPageLabel: String(pageNumber),
  });
  const read = await tools.read_document_page!.execute!(
    { attachmentId: URS_ID, pageNumber },
    TEST_TOOL_OPTIONS
  );
  expect(read).toMatchObject({ status: "found" });
}

async function readIqPage(
  tools: ReturnType<typeof buildChatTools>,
  pageNumber: number,
  transcript: string
) {
  readDocumentPageMock.mockResolvedValueOnce({
    attachmentId: IQ_ID,
    filename: IQ_FILENAME,
    pageNumber,
    transcript,
    visualInterpretation: "",
    pageContext: null,
    printedPageLabel: String(pageNumber),
  });
  const read = await tools.read_document_page!.execute!(
    { attachmentId: IQ_ID, pageNumber },
    TEST_TOOL_OPTIONS
  );
  expect(read).toMatchObject({ status: "found" });
}

function proposedTableOp(inserted: Array<{ content?: string }>): TableOperation {
  const comment = inserted.find((row) => {
    const parsed = parseAiFixCommentContent(String(row.content ?? ""));
    return parsed.tableOperation != null;
  });
  expect(comment).toBeTruthy();
  const payload = parseAiFixCommentContent(String(comment!.content));
  expect(payload.tableOperation).toBeTruthy();
  return payload.tableOperation!;
}

describe("QSR RTM section 5 draft replay", () => {
  const inserted: Array<{ content?: string }> = [];

  beforeEach(() => {
    inserted.length = 0;
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
    dbUpdateMock.mockReset();
    getReportAnalyticsMock.mockReset();
    getReportAnalyticsMock.mockResolvedValue(null);
    readDocumentPageMock.mockReset();
    listReadyDocumentsForReportMock.mockReset();
    listDocumentPagesForReviewMock.mockReset();
    loadDocumentPageEvidenceMock.mockReset();
    loadDocumentPageEvidenceMock.mockResolvedValue([]);
    searchReportDocumentsManyMock.mockReset();
    searchReportDocumentsManyMock.mockResolvedValue([]);
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc()]);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockImplementation((row: { content?: string }) => {
        inserted.push(row);
        return Promise.resolve();
      }),
    });
    dbUpdateMock.mockReturnValue({
      set: () => ({ where: vi.fn().mockResolvedValue([]) }),
    });
  });

  it("proposes cover-page 8000 L on the seeded URS-1 row instead of <capacity>", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 1);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-1 capacity from the URS cover.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            { row: 1, col: 1, insertText: "Reactor Capacity" },
            {
              row: 1,
              col: 2,
              insertText: `8000 L [${URS_FILENAME}, p. 1]`,
            },
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("edit_cells");
    const cells = op.kind === "edit_cells" ? op.cells : [];
    expect(cells.map((cell) => cell.insertText).join(" ")).toContain("8000 L");
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toContain(
      "<capacity>"
    );
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toContain(
      "<number>"
    );
  });

  it("proposes 0 to 760 mmHg on URS-35 when that range sits before the next URS ID", async () => {
    mockSection("qsr_rtm_control");
    const tools = buildTools({ section: "qsr_rtm_control" });
    await readUrsPage(tools, 8);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_control",
        targetField: "table",
        reasoning: "Add the vacuum gauge row from the URS.",
        operation: {
          kind: "insert_rows",
          rows: [
            [
              "URS-35",
              "Vacuum gauge",
              "Vacuum gauge to measure the vacuum produced",
              "0 to 760 mmHg",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("760 mmHg");
  });

  it("proposes SS 316L on a GMP contact-parts row instead of treating it as litres", async () => {
    mockSection("qsr_rtm_gmp");
    const tools = buildTools({ section: "qsr_rtm_gmp" });
    await readUrsPage(tools, 9);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_gmp",
        targetField: "table",
        reasoning: "Add contact-parts MOC from the URS.",
        operation: {
          kind: "insert_rows",
          rows: [
            [
              "URS-39",
              "Contact parts MOC",
              "Glass lined / SS 316L",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("SS 316L");
    expect(rows.flat().join(" ")).not.toContain("<number>");
  });

  it("proposes URS-2 through URS-4, including User requirements, from a column-major page", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 6);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert the process rows from the column-major URS page.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-2",
              "MOC",
              "High-quality Glass Lining and thickness should not be less than 1 mm",
              "",
              "",
              "",
            ],
            [
              "URS-3",
              "Shell Operating temperature",
              "15 °C to 130 °C",
              "",
              "",
              "",
            ],
            [
              "URS-4",
              "Shell Operating pressure",
              "Full Vacuum to 3.5 Kg/cm²",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    const text = rows.flat().join(" ");
    expect(rows).toHaveLength(3);
    expect(text).toContain("1 mm");
    expect(text).toContain("15 °C");
    expect(text).toContain("130 °C");
    expect(text).toContain("3.5 Kg/cm²");
  });

  it("still blocks URS-37's temperature on the URS-5 row after a same-page repair search", async () => {
    mockSection("qsr_rtm_process");
    searchReportDocumentsManyMock.mockResolvedValue([
      [
        {
          attachmentId: URS_ID,
          filename: URS_FILENAME,
          description: null,
          pageNumber: 4,
          chunkId: "c1",
          sourceKind: "hybrid",
          text: NEIGHBOUR_QUOTE,
          quote: NEIGHBOUR_QUOTE,
          citationId: `att:${URS_ID}:p:4`,
          ingestRunId: "run",
        },
      ],
    ]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 4);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill jacket temperature.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [["URS-5", "Jacket temperature", "15–130 °C", "", "", ""]],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "unsupported_facts" });
    expect(
      (result as { unsupported?: Array<{ text: string }> }).unsupported?.map(
        (fact) => fact.text
      )
    ).toEqual(expect.arrayContaining(["15–130 °C"]));
    expect(
      inserted.some((row) => {
        const parsed = parseAiFixCommentContent(String(row.content ?? ""));
        return parsed.tableOperation != null;
      })
    ).toBe(false);
  });

  it("proposes the URS copy and empties stock Complies when no protocol names the ID", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 4);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Stamp IQ Complies on URS-5.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [["URS-5", "Jacket temperature", "20-25 °C", "IQ", "Section 13", "Complies"]],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows[0]?.[0]).toContain("URS-5");
    expect(rows[0]?.[1]).toBe("Jacket temperature");
    expect(rows[0]?.[2]).toContain("20-25 °C");
    expect(rows[0]?.slice(3)).toEqual(["", "", ""]);
    expect(rows.flat().join(" ")).not.toMatch(/Complies/i);
  });

  it("keeps IQ / Complies when Installation Qualification names that URS ID", async () => {
    mockSection("qsr_rtm_process");
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 4);
    await readIqPage(
      tools,
      12,
      "URS-5 Installation check meets acceptance. Section 8.1. Result: complies."
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-5 from the URS and IQ.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [["URS-5", "Jacket temperature", "20-25 °C", "IQ", "8.1", "Complies"]],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows[0]?.[0]).toContain("URS-5");
    expect(rows[0]?.[1]).toBe("Jacket temperature");
    expect(rows[0]?.[2]).toContain("20-25 °C");
    expect(rows[0]?.[3]).toContain("IQ");
    expect(rows[0]?.[4]).toContain("8.1");
    expect(rows[0]?.[4]).not.toMatch(/Section 13/i);
    expect(rows[0]?.[5]).toMatch(/Complies/i);
  });

  it("proposes NLT 25.0 m² without treating the decimal as a measured zero", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 12);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-62 heat transfer area.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [["URS-62", "Heat Transfer Area", "NLT 25.0 m²", "", "", ""]],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("25.0");
    expect(rows.flat().join(" ")).not.toContain("<number>");
  });

  it("keeps an empty 5.2 table locked until a matching RTM review has finished", async () => {
    mockSection("qsr_rtm_control");
    const tools = buildChatTools({
      reportId: REPORT_ID,
      canEdit: true,
      actor: ACTOR,
      documentType: "qualification_summary_report",
      sectionScope: "qsr_rtm_control",
      reviewCoverageObjective: "qsr_rtm_control",
      unsupportedFactPolicy: "block",
    });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_control",
        targetField: "table",
        reasoning: "Fill control philosophy.",
        operation: {
          kind: "insert_rows",
          rows: [["URS-35", "Vacuum gauge", "", "0 to 760 mmHg", "", "", ""]],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "review_incomplete" });
  });

  it("unlocks 5.2 after a 5.1 URS walk that skipped DQ, then proposes the vacuum range", async () => {
    mockSection("qsr_rtm_control");
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), dqDoc()]);
    const ursReviewPages = Array.from({ length: 12 }, (_, index) => {
      const pageNumber = index + 1;
      const fixture = URS_PAGES[pageNumber];
      return {
        attachmentId: URS_ID,
        filename: URS_FILENAME,
        pageNumber,
        transcript:
          fixture?.transcript ?? `URS-${pageNumber + 1} process requirement`,
        pageContext: null,
        printedPageLabel: String(pageNumber),
      };
    });
    const dqReviewPages = Array.from({ length: 40 }, (_, index) => ({
      attachmentId: DQ_ID,
      filename: DQ_FILENAME,
      pageNumber: index + 1,
      transcript: "Design qualification protocol equipment drawing contents",
      pageContext: null,
      printedPageLabel: String(index + 1),
    }));
    listDocumentPagesForReviewMock.mockResolvedValue([
      ...ursReviewPages,
      ...dqReviewPages,
    ]);
    loadDocumentPageEvidenceMock.mockImplementation(
      async ({
        pages,
      }: {
        pages: Array<{ attachmentId: string; pageNumber: number }>;
      }) =>
        pages.flatMap((page) => {
          if (page.attachmentId !== URS_ID) return [];
          const fixture = URS_PAGES[page.pageNumber];
          const quote =
            fixture?.transcript ??
            `URS-${page.pageNumber + 1} process requirement`;
          return [
            {
              attachmentId: URS_ID,
              filename: URS_FILENAME,
              pageNumber: page.pageNumber,
              quote,
              ingestRunId: "run",
              citationId: `att:${URS_ID}:p:${page.pageNumber}`,
            },
          ];
        })
    );

    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const tools = buildChatTools({
      reportId: REPORT_ID,
      canEdit: true,
      actor: ACTOR,
      documentType: "qualification_summary_report",
      sectionScope: "qsr_rtm_process",
      reviewCoverageObjective: "qsr_rtm_process",
      documentReview: session,
      unsupportedFactPolicy: "block",
      retrievalPolicy: "comprehensive",
    });

    const started = await tools.start_document_review!.execute!(
      { objective: "qsr_rtm_process" },
      TEST_TOOL_OPTIONS
    );
    expect(started).toMatchObject({ status: "started" });
    expect(
      (started as { skippedDocuments?: { attachmentId: string }[] })
        .skippedDocuments?.map((doc) => doc.attachmentId)
    ).toEqual([DQ_ID]);

    let guard = 0;
    while (session.phase() === "in_progress") {
      guard += 1;
      expect(guard).toBeLessThan(40);
      await tools.continue_document_review!.execute!({}, TEST_TOOL_OPTIONS);
    }
    const finished = (await tools.finish_document_review!.execute!(
      {},
      TEST_TOOL_OPTIONS
    )) as {
      status: string;
      truncated?: boolean;
      skippedAttachmentIds?: string[];
      coverageKey?: string | null;
    };
    expect(finished).toMatchObject({ status: "complete" });
    expect(finished.truncated).toBe(true);
    expect(finished.skippedAttachmentIds).toEqual(
      expect.arrayContaining([DQ_ID])
    );
    expect(session.inventoryFinishSatisfiesDraft()).toBe(true);

    const nextTurn = new DocumentReviewSession();
    nextTurn.restoreFromFinishedReview({
      coverageKey: String(finished.coverageKey ?? ""),
    });
    const nextTurnTools = buildChatTools({
      reportId: REPORT_ID,
      canEdit: true,
      actor: ACTOR,
      documentType: "qualification_summary_report",
      sectionScope: "qsr_rtm_control",
      reviewCoverageObjective: "qsr_rtm_control",
      documentReview: nextTurn,
      unsupportedFactPolicy: "block",
    });
    const again = await nextTurnTools.start_document_review!.execute!(
      { objective: "qsr_rtm_control" },
      TEST_TOOL_OPTIONS
    );
    expect(again).toMatchObject({ status: "already_complete" });

    const drafted = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_control",
        targetField: "table",
        reasoning: "Fill 5.2 from the finished URS walk.",
        operation: {
          kind: "insert_rows",
          rows: [
            [
              "URS-35",
              "Vacuum gauge",
              "Vacuum gauge to measure the vacuum produced",
              "0 to 760 mmHg",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(drafted).not.toMatchObject({ status: "review_incomplete" });
    expect(drafted).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("760 mmHg");
  });
});
