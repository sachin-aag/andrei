import { beforeEach, describe, expect, it, vi } from "vitest";
import { comments, reportSections } from "@/db/schema";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";
import {
  DocumentReviewSession,
  extractReviewFindingsFromPages,
} from "@/lib/ai/chat/document-review";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { emptyQsrContent, QSR_RTM_HEADERS } from "@/lib/document-types/qsr/sections";
import type { QsrSectionKey } from "@/lib/document-types/qsr/sections";
import type { JSONContent } from "@tiptap/core";
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
const OQ_FILENAME = "Operational Qualification.PDF";
const OQ_ID = "att_oq";
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

function oqDoc(pageCount = 40) {
  return {
    attachmentId: OQ_ID,
    filename: OQ_FILENAME,
    description: null,
    pageCount,
    ingestRunId: "run",
    documentSummary: null,
  };
}

function mockSection(
  section: QsrSectionKey,
  content: ReturnType<typeof emptyQsrContent> = emptyQsrContent(section)
) {
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
                  content,
                },
              ]
            : []
      ),
    }),
  }));
}

function rtmTableDoc(rows: string[][]): JSONContent {
  const textCell = (
    type: "tableHeader" | "tableCell",
    text: string
  ): JSONContent => ({
    type,
    content: text
      ? [{ type: "paragraph", content: [{ type: "text", text }] }]
      : [{ type: "paragraph" }],
  });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [...QSR_RTM_HEADERS].map((header) =>
              textCell("tableHeader", header)
            ),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: [...QSR_RTM_HEADERS].map((_, col) =>
              textCell("tableCell", row[col] ?? "")
            ),
          })),
        ],
      },
    ],
  };
}

const TABLE5_URS_ROWS = [
  [
    "URS-4",
    "Shell Operating pressure",
    "Full Vacuum to 3.5 Kg/cm²",
    "",
    "",
    "",
  ],
  ["URS-13", "Jacket Type", "Limpet/Plain", "", "", ""],
];

const TABLE5_PLACEHOLDER_CELLS = [
  {
    row: 1,
    col: 3,
    rowKey: "URS-13",
    insertText: "<qualification stage>",
    rowContext: "URS-13\nJacket Type\nLimpet/Plain",
  },
  {
    row: 1,
    col: 4,
    rowKey: "URS-13",
    insertText: "<section>",
    rowContext: "URS-13\nJacket Type\nLimpet/Plain",
  },
  {
    row: 1,
    col: 5,
    rowKey: "URS-13",
    insertText: "<remarks>",
    rowContext: "URS-13\nJacket Type\nLimpet/Plain",
  },
  {
    row: 1,
    col: 5,
    rowKey: "URS-4",
    insertText: "<remarks>",
    rowContext: "URS-4\nShell Operating pressure\nFull Vacuum to 3.5 Kg/cm²",
  },
];

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

async function readOqPage(
  tools: ReturnType<typeof buildChatTools>,
  pageNumber: number,
  transcript: string
) {
  readDocumentPageMock.mockResolvedValueOnce({
    attachmentId: OQ_ID,
    filename: OQ_FILENAME,
    pageNumber,
    transcript,
    visualInterpretation: "",
    pageContext: null,
    printedPageLabel: String(pageNumber),
  });
  const read = await tools.read_document_page!.execute!(
    { attachmentId: OQ_ID, pageNumber },
    TEST_TOOL_OPTIONS
  );
  expect(read).toMatchObject({ status: "found" });
}

async function readDqPage(
  tools: ReturnType<typeof buildChatTools>,
  pageNumber: number,
  transcript: string
) {
  readDocumentPageMock.mockResolvedValueOnce({
    attachmentId: DQ_ID,
    filename: DQ_FILENAME,
    pageNumber,
    transcript,
    visualInterpretation: "",
    pageContext: null,
    printedPageLabel: String(pageNumber),
  });
  const read = await tools.read_document_page!.execute!(
    { attachmentId: DQ_ID, pageNumber },
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

  it("proposes URS-33 when the URS page wraps the ID at the table footer", async () => {
    mockSection("qsr_rtm_process", {
      table: rtmTableDoc([
        ["URS-30", "Batch Size", "", "", "", ""],
        ["URS-31", "Type of Operation", "", "", "", ""],
        ["URS-32", "Location", "", "", "", ""],
      ]),
    });
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 8,
      transcript:
        "URS ID # Parameters User requirements URS-30 Batch Size URS-31 Type of Operation URS-32 Location URS- 33 Stage and location Format. No.:-QAD-SOP-FS-003-F03-00 Page 8 of 12 Equipment intended for intermediate stage manufacturing operations.",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "8",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 8 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert URS-33 from the URS page-8 table.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-32",
          rows: [
            [
              "URS-33",
              "Stage and location",
              "Equipment intended for intermediate stage manufacturing operations.",
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
    expect(rows[0]?.[0]).toMatch(/^URS-33/);
    expect(rows.flat().join(" ")).toContain("Stage and location");
    expect(rows.flat().join(" ")).toContain(
      "intermediate stage manufacturing operations"
    );
  });

  it("proposes 3.5 Kg/cm² when OCR split the decimal on the URS page", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript:
        "URS-1 Reactor Capacity URS-4 Shell Operating pressure URS-6 Jacket Operating Pressure 8000 L Full Vacuum to 3 . 5 Kg/cm² 3 to 5 Kg/cm²",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-4 pressure from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
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
    expect(rows.flat().join(" ")).toContain("3.5");
    expect(rows.flat().join(" ")).not.toContain("<number>");
  });

  it("blocks unsigned 15 °C on operating-range Minimum when the URS shows −15 °C", async () => {
    mockSection("qsr_operating_range");
    const tools = buildTools({ section: "qsr_operating_range" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript:
        "URS-3 Shell Operating temperature −15 °C to 130 °C",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_operating_range",
        targetField: "table",
        reasoning: "Fill temperature minimum from the URS.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [{ row: 4, col: 3, rowKey: "4.", insertText: "15 °C" }],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "unsupported_facts" });
    expect(
      (result as { unsupported?: Array<{ text: string }> }).unsupported?.map(
        (fact) => fact.text
      )
    ).toEqual(expect.arrayContaining(["15 °C"]));
    expect(
      inserted.some((row) => {
        const parsed = parseAiFixCommentContent(String(row.content ?? ""));
        return parsed.tableOperation != null;
      })
    ).toBe(false);
  });

  it("proposes −15 °C on operating-range Minimum from the URS", async () => {
    mockSection("qsr_operating_range");
    const tools = buildTools({ section: "qsr_operating_range" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript:
        "URS-3 Shell Operating temperature −15 °C to 130 °C",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_operating_range",
        targetField: "table",
        reasoning: "Fill temperature minimum from the URS.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [{ row: 4, col: 3, rowKey: "4.", insertText: "−15 °C" }],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("edit_cells");
    const cells = op.kind === "edit_cells" ? op.cells : [];
    expect(cells.map((cell) => cell.insertText).join(" ")).toContain("−15 °C");
  });

  it("blocks unsigned 15 °C on URS-3 when the column-major URS value is −15 °C", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript:
        "URS ID # Parameters User requirements URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-4 Shell Operating pressure URS-12 Jacket MOC Format. No.:-QAD-SOP-FS-003-F03-00 8000 L High-quality Glass Lining and thickness should not be less than 1 mm −15 °C to 130 °C Full Vacuum to 3.5 Kg/cm²",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const blocked = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert URS-3 from the column-major URS page.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-3",
              "Shell Operating temperature",
              "15 °C to 130 °C",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(blocked).toMatchObject({ status: "unsupported_facts" });
    const proposed = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert URS-3 from the column-major URS page.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-3",
              "Shell Operating temperature",
              "−15 °C to 130 °C",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(proposed).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("−15 °C");
  });

  it("blocks unsigned 15 °C on URS-3 when the parser dropped the minus and visualInterpretation recovered it", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript: COLUMN_QUOTE,
      visualInterpretation:
        "URS-3 shell operating temperature prints −15 °C to 130 °C",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const blocked = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert URS-3 from the URS page.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-3",
              "Shell Operating temperature",
              "15 °C to 130 °C",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(blocked).toMatchObject({ status: "unsupported_facts" });
    const proposed = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Insert URS-3 from the recovered signed temperature.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-3",
              "Shell Operating temperature",
              "−15 °C to 130 °C",
              "",
              "",
              "",
            ],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(proposed).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("−15 °C");
  });

  it("blocks unsigned 15 °C on operating-range Minimum when URS-37 is also 15–130 °C", async () => {
    mockSection("qsr_operating_range");
    const tools = buildTools({ section: "qsr_operating_range" });
    readDocumentPageMock
      .mockResolvedValueOnce({
        attachmentId: URS_ID,
        filename: URS_FILENAME,
        pageNumber: 6,
        transcript: "URS-3 Shell Operating temperature −15 °C to 130 °C",
        visualInterpretation: "",
        pageContext: null,
        printedPageLabel: "6",
      })
      .mockResolvedValueOnce({
        attachmentId: URS_ID,
        filename: URS_FILENAME,
        pageNumber: 4,
        transcript: NEIGHBOUR_QUOTE,
        visualInterpretation: "",
        pageContext: null,
        printedPageLabel: "4",
      });
    await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 4 },
      TEST_TOOL_OPTIONS
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_operating_range",
        targetField: "table",
        reasoning: "Fill temperature minimum from the URS.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [{ row: 4, col: 3, rowKey: "4.", insertText: "15 °C" }],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "unsupported_facts" });
  });

  it("blocks unsigned 50+-10 RPM on URS-10 when the URS shows −50 ± 10 RPM", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 7,
      transcript: "URS-10 RPM requirement –50 ± 10 RPM",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "7",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 7 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-10 RPM from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            ["URS-10", "RPM requirement", "50+-10 RPM", "", "", ""],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "unsupported_facts" });
    expect(
      (result as { unsupported?: Array<{ text: string }> }).unsupported?.map(
        (fact) => fact.text
      ).join(" ")
    ).toMatch(/50/);
    expect(
      inserted.some((row) => {
        const parsed = parseAiFixCommentContent(String(row.content ?? ""));
        return parsed.tableOperation != null;
      })
    ).toBe(false);
  });

  it("proposes −50 ± 10 RPM on URS-10 from the URS", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 7,
      transcript: "URS-10 RPM requirement –50 ± 10 RPM",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "7",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 7 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-10 RPM from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            ["URS-10", "RPM requirement", "–50 ± 10 RPM", "", "", ""],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toMatch(/[-−–]50/);
    expect(rows.flat().join(" ")).toMatch(/10\s*RPM/i);
  });

  it("proposes ~50±10 RPM on URS-10 when the URS shows a tilde", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 6,
      transcript: "URS-10 RPM requirement ~50±10 RPM",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "6",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 6 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-10 RPM from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            ["URS-10", "RPM requirement", "~50±10 RPM", "", "", ""],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toContain("~50");
    expect(rows.flat().join(" ")).not.toMatch(/[-−–]50/);
  });

  it("blocks unsigned 20 °C on URS-37 when the URS shows −20 °C to 150 °C", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 8,
      transcript:
        "URS-37 Temperature To measure the temperature - 20 °C to 150 °C",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "8",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 8 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-37 temperature from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            ["URS-37", "Temperature", "20 °C", "", "", ""],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "unsupported_facts" });
    expect(
      (result as { unsupported?: Array<{ text: string }> }).unsupported?.map(
        (fact) => fact.text
      )
    ).toEqual(expect.arrayContaining(["20 °C"]));
    expect(
      inserted.some((row) => {
        const parsed = parseAiFixCommentContent(String(row.content ?? ""));
        return parsed.tableOperation != null;
      })
    ).toBe(false);
  });

  it("proposes −20 °C to 150 °C on URS-37 from the URS", async () => {
    mockSection("qsr_rtm_process");
    const tools = buildTools({ section: "qsr_rtm_process" });
    readDocumentPageMock.mockResolvedValueOnce({
      attachmentId: URS_ID,
      filename: URS_FILENAME,
      pageNumber: 8,
      transcript:
        "URS-37 Temperature To measure the temperature - 20 °C to 150 °C",
      visualInterpretation: "",
      pageContext: null,
      printedPageLabel: "8",
    });
    const read = await tools.read_document_page!.execute!(
      { attachmentId: URS_ID, pageNumber: 8 },
      TEST_TOOL_OPTIONS
    );
    expect(read).toMatchObject({ status: "found" });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-37 temperature from the URS.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            ["URS-37", "Temperature", "-20 °C to 150 °C", "", "", ""],
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    expect(op.kind).toBe("insert_rows");
    const rows = op.kind === "insert_rows" ? op.rows : [];
    expect(rows.flat().join(" ")).toMatch(/-20/);
    expect(rows.flat().join(" ")).toContain("150");
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

  it("keeps IQ / 13.3.5.1 from a jacket IQ page that never prints URS-5", async () => {
    mockSection("qsr_rtm_process");
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 4);
    await readIqPage(
      tools,
      22,
      "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 22 of 60 UNCONTROLLED COPY 13.3.5.1. Jacket Specifications Temperature −28.8/220 Jacket Outer diameter Thickness 12 mm Verification Verified By Date"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-5 Stage/Section from the jacket IQ page.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-5",
              "Jacket temperature",
              "20-25 °C",
              "IQ",
              "13.3.5.1",
              "Complies",
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
    expect(rows[0]?.[0]).toContain("URS-5");
    expect(rows[0]?.[3]).toContain("IQ");
    expect(rows[0]?.[4]).toContain("13.3.5.1");
    expect(rows[0]?.[5] ?? "").not.toMatch(/Complies/i);
    expect(result).toMatchObject({
      adjustedCells: expect.arrayContaining([
        expect.objectContaining({
          rowKey: "URS-5",
          column: "Remarks",
          requested: "Complies",
          saved: "",
        }),
      ]),
    });
  });

  it("keeps chat DQ / 12.1 even when both protocol bodies topic-match", async () => {
    mockSection("qsr_rtm_process");
    listReadyDocumentsForReportMock.mockResolvedValue([
      ursDoc(),
      dqDoc(),
      iqDoc(),
    ]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 4);
    await readDqPage(
      tools,
      11,
      "12.1 Jacket Design Temperature −28.8/220 Jacket volume 773 L"
    );
    await readIqPage(
      tools,
      22,
      "13.3.5.1. Jacket Specifications Temperature −28.8/220 Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-5 remaining columns.",
        operation: {
          kind: "insert_rows",
          afterRowKey: "URS-1",
          rows: [
            [
              "URS-5",
              "Jacket temperature",
              "20-25 °C",
              "DQ",
              "12.1",
              "Complies",
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
    expect(rows[0]?.[3]).toMatch(/^DQ\b/);
    expect(rows[0]?.[3] ?? "").not.toMatch(/\bIQ\b/);
    expect(rows[0]?.[4]).toContain("12.1");
    expect(rows[0]?.[4] ?? "").not.toContain("13.3.5.1");
  });

  it("does not fill URS-1 Stage from an IQ running header", async () => {
    mockSection("qsr_rtm_process");
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 1);
    await readIqPage(
      tools,
      1,
      "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60 UNCONTROLLED COPY Equipment Name Glass Lined Reactor"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill URS-1 from the IQ header.",
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
            { row: 1, col: 3, insertText: "IQ", rowContext: "URS-1\nReactor Capacity" },
            {
              row: 1,
              col: 5,
              insertText: "Complies",
              rowContext: "URS-1\nReactor Capacity\nIQ",
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
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toMatch(/\bIQ\b/);
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toMatch(/Complies/i);
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

  it("unlocks 5.2 after a 5.1 URS-only walk even when DQ is also attached", async () => {
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
    expect(started).toMatchObject({ status: "started", totalPages: 12 });
    expect(listDocumentPagesForReviewMock).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      attachmentIds: [URS_ID],
    });
    expect(
      (started as { skippedDocuments?: { attachmentId: string }[] })
        .skippedDocuments?.map((doc) => doc.attachmentId)
    ).toEqual([]);

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
    expect(finished.truncated).toBe(false);
    expect(finished.skippedAttachmentIds ?? []).toEqual([]);
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

  it("unlocks 5.2 after a control-philosophy URS walk that never stamped qsr_rtm_control", async () => {
    mockSection("qsr_rtm_control");
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
    listDocumentPagesForReviewMock.mockResolvedValue(ursReviewPages);
    loadDocumentPageEvidenceMock.mockImplementation(
      async ({
        pages,
      }: {
        pages: Array<{ attachmentId: string; pageNumber: number }>;
      }) =>
        pages.flatMap((page) => {
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
      sectionScope: "all",
      reviewCoverageObjective: "perfect now draft 5.2,5.3, 5.4",
      documentReview: session,
      unsupportedFactPolicy: "block",
      retrievalPolicy: "comprehensive",
    });

    const started = await tools.start_document_review!.execute!(
      {
        objective:
          "Extract all requirements for Control Philosophy (5.2), GMP Requirements (5.3), and Safety Requirements (5.4) from the URS.",
        attachmentIds: [URS_ID],
      },
      TEST_TOOL_OPTIONS
    );
    expect(started).toMatchObject({ status: "started" });
    expect(String((started as { coverageKey?: string }).coverageKey ?? "")).toContain(
      "|obj:qsr_rtm"
    );

    let guard = 0;
    while (session.phase() === "in_progress") {
      guard += 1;
      expect(guard).toBeLessThan(40);
      await tools.continue_document_review!.execute!({}, TEST_TOOL_OPTIONS);
    }
    const finished = (await tools.finish_document_review!.execute!(
      {},
      TEST_TOOL_OPTIONS
    )) as { status: string; coverageKey?: string | null };
    expect(finished).toMatchObject({ status: "complete" });
    expect(String(finished.coverageKey ?? "")).toContain("|obj:qsr_rtm");

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
  });

  it("bounces leftover Table 5 <remarks> when only the URS was read", async () => {
    mockSection("qsr_rtm_process", { table: rtmTableDoc(TABLE5_URS_ROWS) });
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 6);
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Draft missing Stage / Section / Remarks in table 5.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: TABLE5_PLACEHOLDER_CELLS,
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({
      status: "unsupported_facts",
      keepSearchOpen: true,
    });
    expect(String((result as { message?: string }).message)).toMatch(
      /Do not persist angle-bracket placeholders in the table/
    );
    expect(String((result as { draftWithPlaceholders?: string }).draftWithPlaceholders)).toMatch(
      /<remarks>/
    );
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("does not fill dummy-row Table 5 placeholders from IQ / OQ after those pages are read", async () => {
    mockSection("qsr_rtm_process", { table: rtmTableDoc(TABLE5_URS_ROWS) });
    listReadyDocumentsForReportMock.mockResolvedValue([
      ursDoc(),
      oqDoc(),
      iqDoc(),
    ]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 6);
    await readOqPage(
      tools,
      10,
      "8.1 Shell Operating pressure Full Vacuum to 3.5 Kg/cm² Result: Verified"
    );
    await readIqPage(
      tools,
      22,
      "13.3.5.1 Jacket Type Limpet Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Draft missing Stage / Section / Remarks in table 5.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: TABLE5_PLACEHOLDER_CELLS,
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).not.toMatchObject({ status: "proposed" });
    expect(dbInsertMock).not.toHaveBeenCalled();
    const blob = JSON.stringify(result);
    expect(blob).not.toMatch(/\bIQ\b/);
    expect(blob).not.toContain("13.3.5.1");
  });

  it("does not persist leftover Table 5 <remarks> on a same-turn retry without protocol pages", async () => {
    mockSection("qsr_rtm_process", { table: rtmTableDoc(TABLE5_URS_ROWS) });
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readUrsPage(tools, 6);
    const operation = {
      kind: "edit_cells" as const,
      tableIndex: 0,
      cells: TABLE5_PLACEHOLDER_CELLS,
    };
    const first = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Draft missing Remarks in table 5.",
        operation,
      },
      TEST_TOOL_OPTIONS
    );
    expect(first).toMatchObject({
      status: "unsupported_facts",
      keepSearchOpen: true,
    });
    const retry = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Draft missing Remarks in table 5.",
        operation,
      },
      TEST_TOOL_OPTIONS
    );
    expect(retry).not.toMatchObject({ status: "proposed" });
    expect(dbInsertMock).not.toHaveBeenCalled();
    if (
      retry &&
      typeof retry === "object" &&
      "status" in retry &&
      retry.status === "unsupported_facts"
    ) {
      expect(
        String((retry as { draftWithPlaceholders?: string }).draftWithPlaceholders)
      ).toMatch(/<remarks>/);
    }
  });

  it("keeps Table 7 URS-41 IQ / 13.6 / Complies in preview when rowContext is only URS-41 / IQ / Complies", async () => {
    const table7Rows = [
      ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
      ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "", ""],
    ];
    mockSection("qsr_rtm_gmp", { table: rtmTableDoc(table7Rows) });
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_gmp" });
    await readIqPage(
      tools,
      42,
      "13.6 Gaskets PTFE or equivalent Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_gmp",
        targetField: "table",
        reasoning: "Fill missing Stage / Section / Remarks for URS-41 in table 7.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 3,
              rowKey: "URS-41",
              expectedText: "",
              insertText: `IQ [${IQ_FILENAME}, p. 42]`,
              rowContext: `URS-41\nIQ [${IQ_FILENAME}, p. 42]\n13.6\nComplies`,
            },
            {
              row: 1,
              col: 4,
              rowKey: "URS-41",
              expectedText: "",
              insertText: "13.6",
              rowContext: `URS-41\nIQ [${IQ_FILENAME}, p. 42]\n13.6\nComplies`,
            },
            {
              row: 1,
              col: 5,
              rowKey: "URS-41",
              expectedText: "",
              insertText: "Complies",
              rowContext: `URS-41\nIQ [${IQ_FILENAME}, p. 42]\n13.6\nComplies`,
            },
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const comment = inserted.find((row) => {
      const parsed = parseAiFixCommentContent(String(row.content ?? ""));
      return parsed.tableOperation != null;
    });
    expect(comment).toBeTruthy();
    const payload = parseAiFixCommentContent(String(comment!.content));
    const op = payload.tableOperation!;
    expect(op.kind).toBe("edit_cells");
    const cells = op.kind === "edit_cells" ? op.cells : [];
    const urs41 = cells
      .filter((cell) => cell.rowKey === "URS-41")
      .map((cell) => cell.insertText)
      .join(" ");
    expect(urs41).toMatch(/\bIQ\b/);
    expect(urs41).toContain("13.6");
    expect(urs41).toMatch(/\[\d+\]/);
    expect(urs41).toMatch(/Complies/i);
    const parked = payload.second?.insertText ?? "";
    expect(parked).toContain(IQ_FILENAME);

    const preview = buildTableOperationPreviewDoc(
      rtmTableDoc(table7Rows),
      op,
      {
        id: "sug-table7-urs41",
        authorId: "ai",
        status: "pending",
        createdAt: "2026-09-27T00:00:00.000Z",
        kind: "fix",
      }
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const urs41Row = JSON.stringify(rows[2]);
    expect(urs41Row).toContain(suggestionInsertMarkName);
    expect(urs41Row).toMatch(/\bIQ\b/);
    expect(urs41Row).toContain("13.6");
    expect(urs41Row).toMatch(/Complies/i);
  });

  it("keeps chat DQ / 12.3 on Table 7 URS-41 instead of rewriting to live 13.6", async () => {
    const table7Rows = [
      ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
      ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "13.6", ""],
    ];
    mockSection("qsr_rtm_gmp", { table: rtmTableDoc(table7Rows) });
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), dqDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_gmp" });
    await readDqPage(
      tools,
      13,
      "URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts & SS corrugated ring Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_gmp",
        targetField: "table",
        reasoning: "Fill missing Stage / Remarks for URS-41 in table 7.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 3,
              rowKey: "URS-41",
              expectedText: "",
              insertText: `DQ [${DQ_FILENAME}, p. 13]`,
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
            },
            {
              row: 1,
              col: 4,
              rowKey: "URS-41",
              expectedText: "13.6",
              insertText: "12.3",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
            },
            {
              row: 1,
              col: 5,
              rowKey: "URS-41",
              expectedText: "",
              insertText: "Complies",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
            },
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    if (result && typeof result === "object" && "status" in result) {
      expect(result.status).not.toBe("error");
    }
    const comment = inserted.find((row) => {
      const parsed = parseAiFixCommentContent(String(row.content ?? ""));
      return parsed.tableOperation != null;
    });
    if (!comment) {
      expect(String((result as { status?: string }).status)).not.toBe("proposed");
      return;
    }
    const payload = parseAiFixCommentContent(String(comment.content));
    const op = payload.tableOperation!;
    expect(op.kind).toBe("edit_cells");
    const cells = op.kind === "edit_cells" ? op.cells : [];
    const blob = cells.map((cell) => cell.insertText).join(" ");
    expect(blob).toMatch(/\bDQ\b/);
    expect(blob).toContain("12.3");
    const section = cells.find((cell) => cell.col === 4);
    expect(section?.insertText).toContain("12.3");
    expect(section?.insertText ?? "").not.toContain("13.6");
    const preview = buildTableOperationPreviewDoc(rtmTableDoc(table7Rows), op, {
      id: "sug-table7-urs41-dq",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const sectionCell = JSON.stringify(
      (rows[2]?.content ?? []).filter(
        (node) => node.type === "tableCell" || node.type === "tableHeader"
      )[4]
    );
    expect(sectionCell).toContain(suggestionInsertMarkName);
  });

  it("keeps chat DQ / 12.3 / Complies on fill-empty URS-41 instead of rewriting to IQ 13.6", async () => {
    const table7Rows = [
      ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
      ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "13.6", ""],
    ];
    mockSection("qsr_rtm_gmp", { table: rtmTableDoc(table7Rows) });
    listReadyDocumentsForReportMock.mockResolvedValue([
      ursDoc(),
      dqDoc(),
      iqDoc(),
    ]);
    const tools = buildTools({ section: "qsr_rtm_gmp" });
    await readIqPage(
      tools,
      42,
      "13.6 Gaskets PTFE or equivalent Result: Verified"
    );
    await readDqPage(
      tools,
      13,
      "URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts & SS corrugated ring Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_gmp",
        targetField: "table",
        reasoning: "Fill empty cells for URS-41 in table 7.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 3,
              rowKey: "URS-41",
              expectedText: "",
              insertText: `DQ [${DQ_FILENAME}, p. 13]`,
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
            },
            {
              row: 1,
              col: 4,
              rowKey: "URS-41",
              expectedText: "13.6",
              insertText: "12.3",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
            },
            {
              row: 1,
              col: 5,
              rowKey: "URS-41",
              expectedText: "",
              insertText: "Complies",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n12.3\nComplies`,
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
    const blob = cells.map((cell) => cell.insertText).join(" ");
    expect(blob).toMatch(/\bDQ\b/);
    expect(blob).toMatch(/Complies/i);
    expect(blob).not.toMatch(/\bIQ\b/);
    expect(blob).toContain("12.3");
    const section = cells.find((cell) => cell.col === 4);
    expect(section?.insertText).toContain("12.3");
    expect(section?.insertText ?? "").not.toContain("13.6");
    const preview = buildTableOperationPreviewDoc(rtmTableDoc(table7Rows), op, {
      id: "sug-table7-urs41-fill-empty",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const cellsInRow = (rows[2]?.content ?? []).filter(
      (node) => node.type === "tableCell" || node.type === "tableHeader"
    );
    const sectionCell = JSON.stringify(cellsInRow[4]);
    expect(sectionCell).toContain(suggestionInsertMarkName);
    expect(JSON.stringify(cellsInRow[3])).toMatch(/\bDQ\b/);
    expect(JSON.stringify(cellsInRow[5])).toMatch(/Complies/i);
  });

  it("paints Complies inline when IQ p.42 names URS-41 in a header list and Verified in the gasket body", async () => {
    const table7Rows = [
      ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
      ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "13.6", ""],
    ];
    mockSection("qsr_rtm_gmp", { table: rtmTableDoc(table7Rows) });
    listReadyDocumentsForReportMock.mockResolvedValue([
      ursDoc(),
      dqDoc(),
      iqDoc(),
    ]);
    const tools = buildTools({ section: "qsr_rtm_gmp" });
    await readIqPage(
      tools,
      42,
      "URS-40 URS-41 URS-42 13.7.5 Material of Construction Verification Nozzles & Manhole Gasket PTFE or equivalent Result: Verified"
    );
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_gmp",
        targetField: "table",
        reasoning: "Fill empty cells for URS-41 in table 7.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 3,
              rowKey: "URS-41",
              expectedText: "",
              insertText: `IQ [${IQ_FILENAME}, p. 42]`,
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n13.7.5\nComplies`,
            },
            {
              row: 1,
              col: 4,
              rowKey: "URS-41",
              expectedText: "13.6",
              insertText: "13.7.5",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n13.7.5\nComplies`,
            },
            {
              row: 1,
              col: 5,
              rowKey: "URS-41",
              expectedText: "",
              insertText: "Complies",
              rowContext: `URS-41\nDQ [${DQ_FILENAME}, p. 13]\n13.7.5\nComplies`,
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
    expect(cells.map((cell) => cell.insertText).join(" ")).toMatch(/Complies/i);
    expect(cells.find((cell) => cell.col === 5)?.insertText).toMatch(/Complies/i);
    const preview = buildTableOperationPreviewDoc(rtmTableDoc(table7Rows), op, {
      id: "sug-table7-urs41-complies-header-list",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const cellsInRow = (rows[2]?.content ?? []).filter(
      (node) => node.type === "tableCell" || node.type === "tableHeader"
    );
    expect(JSON.stringify(cellsInRow[4])).toContain(suggestionInsertMarkName);
    expect(JSON.stringify(cellsInRow[5])).toMatch(/Complies/i);
    expect(JSON.stringify(cellsInRow[5])).toContain(suggestionInsertMarkName);
  });

  it("lands Complies on executed IQ rows (Langfuse 256f0e5d, Table 5 IQ Remarks blank)", async () => {
    // Production: Stage IQ / Section 13.3.5.4 landed but Remarks saved empty,
    // because signed IQ records print no pass word and p.18 has a
    // `Model Number NA` spec cell.
    const table5Rows = [
      ["URS-7", "Agitator", "Anchor agitator, flame proof flange mounted motor", "", "", ""],
      ["URS-13", "Equipment identification", "Manufacturer name plate and serial number", "", "", ""],
    ];
    mockSection("qsr_rtm_process", { table: rtmTableDoc(table5Rows) });
    listReadyDocumentsForReportMock.mockResolvedValue([ursDoc(), iqDoc()]);
    const tools = buildTools({ section: "qsr_rtm_process" });
    await readIqPage(
      tools,
      25,
      "3xper EMPOWERING INNOVATION Issued By MASTER COPY Issued On INSTALLATION QUALIFICATION Carat Kumar Gedla 3xper Innoventure Limited, 30/04/202619:20 Equipment/System Glass Lined Reactor Protocol No. Report No. IQP/GLR-1301 IQR/GLR-1301 Equipment Number GLR-1301 13.3.5.4. Agitator Motor Specifications Revision: 01 Page No. Section Revision: 01 Capacity/Size Effective Date 25 of 60 Production Block-2 8000 L 30-04-2026 Sr. No Parameters 1. Make Actual Verification Verified By Design specifications observations Source (Sign & Date) Design Crompton Crompton 2. Type mounted 3. Motor speed 1470 rpm 14708pm Flame proof, Flange Flame Proof, Analification Afita Design 01-05-2006 01-05-2026 Flange mounted qualification R.Ajita Design qualification R. Ajith 01-05-2026"
    );
    await readIqPage(
      tools,
      18,
      "Issued On 30/04/202619:20 INSTALLATION QUALIFICATION Equipment/System Glass Lined Reactor Page No. 18 of 60 Protocol No. IQP/GLR-1301 Effective Date 30-04-2026 13.3. System Identification & technical specification verification Reactor S. No Description Actual Observation Verified By (Sign & Date) 1.0 Name of the equipment Glass Lined Reactor R.Ajita 2.0 Manufacturer Standard Glass Lining Technology Ltd 01-05-2026 3.0 Model Number NA RANG 01-05-2076 4.0 Serial Number £250710956 RAjith 01-05-2026 7.0 Equipment Identification GLR-1301 01-05-2026"
    );
    const cell = (row: number, col: number, rowKey: string, insertText: string) => ({
      row,
      col,
      rowKey,
      expectedText: "",
      insertText,
    });
    const result = await tools.edit_table!.execute!(
      {
        section: "qsr_rtm_process",
        targetField: "table",
        reasoning: "Fill Stage, Section, and Remarks from the IQ records.",
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            cell(1, 3, "URS-7", `IQ [${IQ_FILENAME}, p. 25]`),
            cell(1, 4, "URS-7", "13.3.5"),
            cell(1, 5, "URS-7", "Complies"),
            cell(2, 3, "URS-13", `IQ [${IQ_FILENAME}, p. 18]`),
            cell(2, 4, "URS-13", "13.3"),
            cell(2, 5, "URS-13", "Complies"),
          ],
        },
      },
      TEST_TOOL_OPTIONS
    );
    expect(result).toMatchObject({ status: "proposed" });
    const op = proposedTableOp(inserted);
    const cells = op.kind === "edit_cells" ? op.cells : [];
    const remarks = (rowKey: string) =>
      cells.find((c) => c.rowKey === rowKey && c.col === 5)?.insertText;
    expect(remarks("URS-7")).toBe("Complies");
    expect(remarks("URS-13")).toBe("Complies");
    const adjusted =
      (result as { adjustedCells?: Array<{ column?: string }> }).adjustedCells ?? [];
    expect(adjusted.filter((adj) => adj.column === "Remarks")).toEqual([]);
    expect(cells.find((c) => c.rowKey === "URS-7" && c.col === 3)?.insertText).toMatch(
      /^IQ\b/
    );
  });
});
