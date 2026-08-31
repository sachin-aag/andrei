import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/attachments/retrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/attachments/retrieval")>();
  return {
    ...actual,
    listDocumentPagesForReview: vi.fn(),
    listReadyDocumentsForReport: vi.fn(),
    readDocumentOutline: vi.fn(),
    readDocumentPage: vi.fn(),
    searchReportDocuments: vi.fn(),
  };
});

vi.mock("@/lib/ai/chat/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/chat/tools")>();
  return {
    ...actual,
    buildChatTools: vi.fn(() => ({
      search_documents: { kind: "search" },
      read_document_page: { kind: "page" },
      document_outline: { kind: "outline" },
      ask_user: { kind: "ask" },
      propose_edit: { kind: "edit" },
      draft_field: { kind: "draft" },
      read_section: { kind: "section" },
    })),
  };
});

vi.mock("@/lib/ai/chat/model", () => ({
  resolveChatExtractLanguageModel: vi.fn(),
}));

vi.mock("@/lib/analytics-revisions/record-change", () => ({
  tryRecordAnalyticsChange: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  createAnalysisForReport: vi.fn(),
  getOrCreateReportAnalytics: vi.fn(),
  updateReportAnalytics: vi.fn(),
  updateAnalysisForReport: vi.fn(),
}));

import {
  listReadyDocumentsForReport,
  readDocumentPage,
  type DocumentPageRead,
} from "@/lib/attachments/retrieval";
import {
  ANALYTICS_CHAT_TOOL_NAMES,
  WRITE_COLUMN_NEED_SOURCE_MESSAGE,
  buildAnalyticsChatTools,
  extractNumericTokens,
  pickAnalyticsDocumentTools,
} from "./chat-tools";
import { P1_PUW_COMBINED_TRANSCRIPT, P1_PUW_FILENAME } from "@/lib/extraction/__fixtures__/p1-puw-qualification-phase-ii";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";
import { AMBIGUOUS_METRIC_REQUEST_MESSAGE } from "@/lib/extraction/metric-series";
import { buildAnalyticsChatSystemPrompt } from "./chat-prompt";
import {
  createAnalysisForReport,
  getOrCreateReportAnalytics,
  updateAnalysisForReport,
  updateReportAnalytics,
} from "./store";
import type { BoxplotAnalysisSummary, ReportAnalyticsView, XyScatterAnalysisSummary } from "./types";
import { BOXPLOT, MEASUREMENT_SCATTER, XY_SCATTER } from "./types";
import { createEmptyWorksheet, insertColumn, renameColumn, replaceColumnValues } from "./worksheet";

function pageRead(transcript: string): DocumentPageRead {
  return {
    attachmentId: "att_1",
    filename: "bmr.pdf",
    description: null,
    pageNumber: 31,
    printedPageLabel: null,
    transcript,
    visualInterpretation: "",
    pageContext: null,
    ingestRunId: "run_1",
  };
}

function analyticsView(
  worksheet = createEmptyWorksheet()
): ReportAnalyticsView {
  return {
    id: "ws-1",
    reportId: "report-1",
    worksheet,
    analyses: [],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

type ZodToolSchema = z.ZodType<Record<string, unknown>>;

describe("analytics chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never exposes drafting or report-edit tools", () => {
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("propose_edit");
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("draft_field");
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("read_section");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("search_documents");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("write_column");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("manage_worksheet");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("run_capability_sixpack");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("run_one_way_anova");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("plot_measurements");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("plot_xy_scatter");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("plot_boxplot");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("scan_attachments");
  });

  it("picks only the document tools the analytics assistant is allowed to call", () => {
    expect(
      pickAnalyticsDocumentTools({
        search_documents: 1,
        propose_edit: 2,
        draft_field: 3,
        read_section: 4,
        ask_user: 5,
      })
    ).toEqual({ search_documents: 1, ask_user: 5 });
  });

  it("omits write tools when the report is locked", () => {
    const writable = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    expect(writable.propose_edit).toBeUndefined();
    expect(writable.draft_field).toBeUndefined();
    expect(writable.write_column).toBeDefined();
    expect(writable.manage_worksheet).toBeDefined();
    expect(writable.run_capability_sixpack).toBeDefined();
    expect(writable.run_one_way_anova).toBeDefined();
    expect(writable.plot_measurements).toBeDefined();
    expect(writable.plot_xy_scatter).toBeDefined();
    expect(writable.plot_boxplot).toBeDefined();
    expect(writable.run_capability_sixpack?.description).toContain(
      "not when they asked for a scatter"
    );
    expect(writable.run_one_way_anova?.description).toContain("not a scatter");
    expect(writable.plot_xy_scatter?.description).toContain(
      "Optional legendColumnId color-codes points"
    );
    expect(writable.plot_xy_scatter?.description).toContain(
      "color by lot/batch/serial/group"
    );
    expect(writable.plot_xy_scatter?.description).toContain(
      "Omit xColumnId"
    );
    expect(writable.plot_xy_scatter?.description).toContain("analysisId");
    expect(writable.plot_xy_scatter?.description).toContain("showSpecLimits");
    expect(writable.plot_xy_scatter?.description).toContain("xMin/xMax/yMin/yMax");
    expect(writable.plot_boxplot?.description).toContain("categoryColumnIds");
    expect(writable.plot_boxplot?.description).toContain("innermost first");
    expect(writable.plot_boxplot?.description).toContain("xAxisLabel");
    expect(writable.plot_boxplot?.description).toContain("analysisId");
    expect(writable.plot_measurements?.description).toContain(
      "cannot color by serial number"
    );

    const locked = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: false,
      documentType: "investigation_report",
    });
    expect(locked.write_column).toBeUndefined();
    expect(locked.manage_worksheet).toBeUndefined();
    expect(locked.run_capability_sixpack).toBeUndefined();
    expect(locked.run_one_way_anova).toBeUndefined();
    expect(locked.plot_measurements).toBeUndefined();
    expect(locked.plot_xy_scatter).toBeUndefined();
    expect(locked.plot_boxplot).toBeUndefined();
    expect(locked.scan_attachments).toBeDefined();
    expect(locked.search_documents).toBeDefined();
    const searchSchema = locked.search_documents?.inputSchema as unknown as ZodToolSchema;
    expect(searchSchema.parse({ query: "Conductivity" })).toMatchObject({
      mode: "keyword",
    });
    expect(locked.search_documents?.description).toContain("At most two calls");
    expect(locked.search_documents?.description).not.toContain(
      "truncated=true means keep grepping"
    );
  });

  it("extracts finite numeric tokens and stops at the worksheet cap", () => {
    expect(extractNumericTokens("Assay 101.84 103.12 n/a 99.4e0")).toEqual([
      101.84, 103.12, 99.4,
    ]);
    expect(extractNumericTokens("no numbers here")).toEqual([]);
  });

  it("requires a single metric on extract_numeric_series", () => {
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const tool = tools.extract_numeric_series;
    if (!tool) throw new Error("extract_numeric_series is missing");
    const schema = tool.inputSchema as unknown as ZodToolSchema;
    expect(schema.safeParse({ attachmentId: "att_1" }).success).toBe(false);
    expect(
      schema.safeParse({ attachmentId: "att_1", metric: "Conductivity" }).success
    ).toBe(true);
  });

  it("refuses an OR-list metric without reading pages", async () => {
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.extract_numeric_series?.execute;
    if (!execute) throw new Error("extract_numeric_series has no execute");
    const result = await execute(
      {
        attachmentId: "att_1",
        metric: "Conductivity or TOC or Level",
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "ambiguous",
      message: AMBIGUOUS_METRIC_REQUEST_MESSAGE,
      values: [],
      dates: null,
    });
    expect(listReadyDocumentsForReport).not.toHaveBeenCalled();
  });

  it("refuses the water PDF dual unlabeled RESULT columns", async () => {
    vi.mocked(listReadyDocumentsForReport).mockResolvedValue([
      {
        attachmentId: "gk2ceb2lzg9dhnf9ug44udxp",
        filename: P1_PUW_FILENAME,
        description: null,
        pageCount: 3,
        ingestRunId: "ul8a6q9ddefvdtkkrekynxhx",
        documentSummary: null,
      },
    ]);
    vi.mocked(readDocumentPage).mockResolvedValue({
      attachmentId: "gk2ceb2lzg9dhnf9ug44udxp",
      filename: P1_PUW_FILENAME,
      description: null,
      pageNumber: 1,
      printedPageLabel: null,
      transcript: P1_PUW_COMBINED_TRANSCRIPT,
      visualInterpretation: "",
      pageContext: null,
      ingestRunId: "ul8a6q9ddefvdtkkrekynxhx",
    });
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.extract_numeric_series?.execute;
    if (!execute) throw new Error("extract_numeric_series has no execute");
    const result = await execute(
      {
        attachmentId: "gk2ceb2lzg9dhnf9ug44udxp",
        pages: [1],
        metric: "Conductivity",
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "ambiguous",
      values: [],
      valueCount: 0,
      dates: null,
    });
    expect(String((result as { message?: string }).message)).toMatch(
      /unlabeled RESULT/i
    );
  });

  it("tells the analytics assistant to ask before extracting two assays", () => {
    const emptyAnalytics = {
      worksheet: {
        columns: [
          { id: "c1", name: "C1", values: [] },
        ],
        specs: [],
      },
      analyses: [],
    } as unknown as ReportAnalyticsView;
    const prompt = buildAnalyticsChatSystemPrompt({
      documentNo: "Trend Water",
      status: "draft",
      documents: [],
      analytics: emptyAnalytics,
      canEdit: true,
      mode: "agent",
    });
    expect(prompt).toContain("ask_user");
    expect(prompt).toContain('Never pass "A or B"');
    expect(prompt).toContain("copy the dates array from that same extract");
    expect(prompt).toContain("stop searching");
    expect(prompt).toContain("at most two search_documents calls");
    expect(prompt).toContain("Whole table");
    expect(prompt).toContain("scan_attachments");
  });

  it("adds a data sheet without searching attachments", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.manage_worksheet?.execute;
    if (!execute) throw new Error("manage_worksheet has no execute");
    const result = await execute(
      { action: "add_sheet", name: "Assay" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "ok",
      action: "add_sheet",
      sheetName: "Assay",
    });
    expect(updateReportAnalytics).toHaveBeenCalled();
    expect(listReadyDocumentsForReport).not.toHaveBeenCalled();
  });

  it("batches several manage_worksheet operations into one save", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.manage_worksheet?.execute;
    if (!execute) throw new Error("manage_worksheet has no execute");
    const result = await execute(
      {
        operations: [
          { action: "add_column", name: "Time (hrs)" },
          { action: "add_column", name: "Temp (°C)" },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "ok",
      operationCount: 2,
    });
    expect(updateReportAnalytics).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1];
    expect(saved?.columns).toHaveLength(8);
    expect(saved?.columns.slice(0, 2).map((column) => column.name)).toEqual([
      "Time (hrs)",
      "Temp (°C)",
    ]);
  });

  it("reports destination and non-numeric cells after write_column", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      { name: "Time", values: ["0", "24", "not a number"] },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      sheetName: "Data",
      columnName: "Time",
      rowsWritten: 3,
      numericCells: 2,
      nonNumericCells: 1,
    });
    expect(String((result as { note?: string }).note)).toMatch(/not numbers/i);
    expect(result).toMatchObject({ columnId: "c1" });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1];
    expect(saved?.columns[0]).toMatchObject({
      id: "c1",
      name: "Time",
      values: ["0", "24", "not a number"],
    });
    expect(saved?.columns[1]?.name).toBe("C2");
  });

  it("writes serials to the named column when add_column assigned a new id", async () => {
    let sheet = replaceColumnValues(
      createEmptyWorksheet(),
      0,
      ["3", "2.5"],
      "Torque (ozf-in)"
    );
    sheet = insertColumn(sheet, 1);
    sheet = renameColumn(sheet, 1, "Handpiece S/N");
    const neighbor = sheet.columns[2];
    const added = sheet.columns[1];
    expect(neighbor?.id).toBe("c2");
    expect(added?.id).not.toBe("c2");
    expect(added?.name).toBe("Handpiece S/N");

    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(analyticsView(sheet));
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        columnId: "c2",
        name: "Handpiece S/N",
        values: ["P33-0924-10012", "P33-0924-10012"],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      columnId: added?.id,
      columnName: "Handpiece S/N",
      rowsWritten: 2,
    });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1];
    expect(saved?.columns.find((col) => col.id === added?.id)?.values.slice(0, 2)).toEqual([
      "P33-0924-10012",
      "P33-0924-10012",
    ]);
    expect(saved?.columns.find((col) => col.id === "c2")?.values ?? []).toEqual([]);
  });

  it("fills the leftmost empty columns even when write_column guesses right-side ids", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    vi.mocked(readDocumentPage).mockResolvedValue(pageRead("101.2 6.8"));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        sourceAttachmentId: "att_1",
        sourcePages: [1],
        columns: [
          { columnId: "c7", name: "Assay %", values: [101.2] },
          { columnId: "c8", name: "pH", values: [6.8] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({ status: "written", columnCount: 2 });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1];
    expect(saved?.columns).toHaveLength(8);
    expect(saved?.columns[0]).toMatchObject({
      id: "c1",
      name: "Assay %",
      values: ["101.2"],
    });
    expect(saved?.columns[1]).toMatchObject({
      id: "c2",
      name: "pH",
      values: ["6.8"],
    });
    expect(saved?.columns[6]?.name).toBe("C7");
    expect(saved?.columns[7]?.name).toBe("C8");
  });

  it("does not overwrite a filled column when writing a new named series", async () => {
    const sheet = replaceColumnValues(
      createEmptyWorksheet(),
      0,
      ["3", "2.5"],
      "Torque (ozf-in)"
    );
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(analyticsView(sheet));
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      { name: "Assay %", values: [101.2, 99.8] },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      columnId: "c2",
      columnName: "Assay %",
    });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1];
    expect(saved?.columns[0]).toMatchObject({
      name: "Torque (ozf-in)",
      values: ["3", "2.5"],
    });
    expect(saved?.columns[1]).toMatchObject({
      id: "c2",
      name: "Assay %",
      values: ["101.2", "99.8"],
    });
  });

  it("retries write_column once after a version conflict", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics)
      .mockResolvedValueOnce({
        ok: false,
        reason: "conflict",
        analytics: { ...initial, version: 2 },
      })
      .mockImplementation(async (_id, worksheet) => ({
        ok: true,
        analytics: { ...analyticsView(worksheet), version: 3 },
      }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      { name: "Time", values: ["0", "24"] },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({ status: "written", columnName: "Time" });
    expect(updateReportAnalytics).toHaveBeenCalledTimes(2);
    expect(updateReportAnalytics).toHaveBeenNthCalledWith(
      2,
      "report-1",
      expect.anything(),
      { expectedVersion: 2 }
    );
  });

  it("requires values or columns on write_column", () => {
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const schema = tools.write_column?.inputSchema as unknown as ZodToolSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ name: "Temp", values: [37.1] }).success).toBe(
      true
    );
    expect(
      schema.safeParse({
        columns: [
          { name: "Temp", values: [37.1] },
          { name: "pH", values: [6.8] },
        ],
      }).success
    ).toBe(true);
    expect(tools.write_column?.description).toContain(
      "leftmost empty C1–C8 columns"
    );
    expect(tools.write_column?.description).toContain(
      "do not call this tool once per column"
    );
    expect(tools.write_column?.description).toContain("never invent 0");
    expect(tools.write_column?.description).toContain(
      "worksheet plots cite the file"
    );
    expect(tools.write_column?.description).toContain(
      "Do not substitute a sixpack or ANOVA for a scatter"
    );
  });

  it("writes several columns in one persist", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    vi.mocked(readDocumentPage).mockResolvedValue(
      pageRead("37.1 6.8 96.7\n37.2 6.9 81.6")
    );
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        sourceAttachmentId: "att_1",
        sourcePages: [31],
        columns: [
          { name: "Temp", values: [37.1, 37.2] },
          { name: "pH", values: [6.8, 6.9] },
          { name: "DO%", values: ["96.7", "81.6"] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      columnCount: 3,
      columns: [
        { columnName: "Temp", rowsWritten: 2, nonNumericCells: 0 },
        { columnName: "pH", rowsWritten: 2, nonNumericCells: 0 },
        { columnName: "DO%", rowsWritten: 2, nonNumericCells: 0 },
      ],
    });
    expect(updateReportAnalytics).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1] as {
      columns: { name: string; values: string[] }[];
    };
    expect(saved.columns[0]).toMatchObject({
      name: "Temp",
      values: ["37.1", "37.2"],
      citations: [{ attachmentId: "att_1", page: 31 }],
    });
    expect(saved.columns[1]).toMatchObject({
      name: "pH",
      values: ["6.8", "6.9"],
      citations: [{ attachmentId: "att_1", page: 31 }],
    });
    expect(saved.columns[2]).toMatchObject({
      name: "DO%",
      values: ["96.7", "81.6"],
      citations: [{ attachmentId: "att_1", page: 31 }],
    });
  });

  it("refuses a table dump with no source page text", async () => {
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        columns: [
          { name: "Air flow (LPM)", values: [38] },
          { name: "O2 flow (LPM)", values: [0] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "need_source",
      message: WRITE_COLUMN_NEED_SOURCE_MESSAGE,
    });
    expect(updateReportAnalytics).not.toHaveBeenCalled();
  });

  it("blanks invented O2 zeros that are not between Air and DO on the source page", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    vi.mocked(readDocumentPage).mockResolvedValue(
      pageRead(
        "02:57 05 36.9 6.99 875 38 2 50.2 0.50 17.2 12.5 0 0 0 yes\n05Hr 03:12 37.2 6.99 875 38 3 58.3 0.50 21.05 11.0 0 0 0 yes"
      )
    );
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        sourceAttachmentId: "att_1",
        sourcePages: [31],
        columns: [
          { name: "RPM", values: [875, 875] },
          { name: "Air flow (LPM)", values: [38, 38] },
          { name: "O2 flow (LPM)", values: [0, 0] },
          { name: "DO (%)", values: [50.2, 58.3] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      blankedCount: 2,
    });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1] as {
      columns: { name: string; values: string[] }[];
    };
    const o2 = saved.columns.find((column) => column.name === "O2 flow (LPM)");
    expect(o2?.values).toEqual([]);
    expect(saved.columns.find((column) => column.name === "DO (%)")?.values).toEqual([
      "50.2",
      "58.3",
    ]);
  });

  it("keeps Tip N and split handpiece SNs on a torque table dump", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const page =
      "Handpiece S/N P33-0924- 10012 - Tip 1: 3 ozf-in " +
      "Handpiece S/N P33-0924- 10012 - Tip 2: 2.5 ozf-in";
    vi.mocked(readDocumentPage).mockResolvedValue(pageRead(page));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        sourceAttachmentId: "att_1",
        sourcePages: [13],
        columns: [
          { name: "Torque (ozf-in)", values: [3, 2.5] },
          {
            name: "Handpiece SN",
            values: ["P33-0924-10012", "P33-0924-10012"],
          },
          { name: "Tip", values: ["Tip 1", "Tip 2"] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      blankedCount: 0,
    });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1] as {
      columns: { name: string; values: string[] }[];
    };
    expect(
      saved.columns.find((column) => column.name === "Tip")?.values
    ).toEqual(["Tip 1", "Tip 2"]);
    expect(
      saved.columns.find((column) => column.name === "Handpiece SN")?.values
    ).toEqual(["P33-0924-10012", "P33-0924-10012"]);
    expect(
      saved.columns.find((column) => column.name === "Torque (ozf-in)")?.values
    ).toEqual(["3", "2.5"]);
  });

  it("blanks invented 0.02 when the source token is 02", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    vi.mocked(readDocumentPage).mockResolvedValue(
      pageRead("875 38.02 02 73.2 0.50")
    );
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const execute = tools.write_column?.execute;
    if (!execute) throw new Error("write_column has no execute");
    const result = await execute(
      {
        sourceAttachmentId: "att_1",
        sourcePages: [31],
        columns: [
          { name: "RPM", values: [875] },
          { name: "Air flow (LPM)", values: [38.02] },
          { name: "O2 flow (LPM)", values: [0.02] },
          { name: "DO (%)", values: [73.2] },
        ],
      },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      status: "written",
      blankedCount: 1,
    });
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1] as {
      columns: { name: string; values: string[] }[];
    };
    expect(
      saved.columns.find((column) => column.name === "O2 flow (LPM)")?.values
    ).toEqual([]);
    expect(
      saved.columns.find((column) => column.name === "Air flow (LPM)")?.values
    ).toEqual(["38.02"]);
  });

  it("stamps remembered extract pages onto a single-series write", async () => {
    vi.stubEnv("ALLOW_TEST_STUB_CHAT", "true");
    try {
      const initial = analyticsView();
      vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
      vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
        ok: true,
        analytics: analyticsView(worksheet),
      }));
      vi.mocked(listReadyDocumentsForReport).mockResolvedValue([
        {
          attachmentId: "att_1",
          filename: "bmr.pdf",
          description: null,
          pageCount: 1,
          ingestRunId: "run_1",
          documentSummary: null,
        },
      ]);
      vi.mocked(readDocumentPage).mockResolvedValue(pageRead("10.1 10.2 10.3"));
      const tools = buildAnalyticsChatTools({
        reportId: "report-1",
        canEdit: true,
        documentType: "investigation_report",
      });
      const extract = tools.extract_numeric_series?.execute;
      const write = tools.write_column?.execute;
      if (!extract || !write) throw new Error("extract or write_column missing");
      const extracted = await extract(
        { attachmentId: "att_1", pages: [31], metric: "Assay" },
        {
          toolCallId: "extract",
          messages: [],
          abortSignal: new AbortController().signal,
        }
      );
      expect(extracted).toMatchObject({
        status: "ok",
        attachmentId: "att_1",
        pages: [31],
      });
      await write(
        { name: "Assay", values: [10.1, 10.2, 10.3] },
        {
          toolCallId: "write",
          messages: [],
          abortSignal: new AbortController().signal,
        }
      );
      const saved = vi.mocked(updateReportAnalytics).mock.calls.at(-1)?.[1] as {
        columns: { name: string; values: string[]; citations?: unknown }[];
      };
      expect(saved.columns[0]).toMatchObject({
        name: "Assay",
        values: ["10.1", "10.2", "10.3"],
        citations: [{ attachmentId: "att_1", page: 31 }],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not cite an attachment for a typed single-column write", async () => {
    const initial = analyticsView();
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    vi.mocked(updateReportAnalytics).mockImplementation(async (_id, worksheet) => ({
      ok: true,
      analytics: analyticsView(worksheet),
    }));
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const write = tools.write_column?.execute;
    if (!write) throw new Error("write_column has no execute");
    await write(
      { name: "Assay", values: [1, 2, 3] },
      {
        toolCallId: "write",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    const saved = vi.mocked(updateReportAnalytics).mock.calls[0]?.[1] as {
      columns: { name: string; citations?: unknown }[];
    };
    expect(saved.columns[0]?.name).toBe("Assay");
    expect(saved.columns[0]?.citations).toBeUndefined();
  });

  it("updates an existing worksheet plot instead of creating a new Results row", async () => {
    const existing: XyScatterAnalysisSummary = {
      id: "plot-1",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: "Assay vs Observation",
      config: {
        xColumnId: null,
        xColumnName: "Observation",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: "Assay vs Observation",
        mark: "scatter",
        showSpecLimits: false,
      },
      results: { specs: [], n: 3, skipped: 0, pearsonR: null },
      sourceHash: "hash",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const initial = analyticsView();
    initial.analyses = [existing];
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    const updated: XyScatterAnalysisSummary = {
      ...existing,
      config: {
        ...existing.config,
        yColumnId: "c2",
        yColumnName: "Moisture",
        mark: "line",
        showSpecLimits: true,
      },
    };
    vi.mocked(updateAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics: { ...initial, analyses: [updated] },
      analysis: updated,
    });
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_xy_scatter?.execute;
    if (!plot) throw new Error("plot_xy_scatter has no execute");
    const output = await plot(
      {
        analysisId: "plot-1",
        yColumnId: "c2",
        mark: "line",
        showSpecLimits: true,
      },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(createAnalysisForReport).not.toHaveBeenCalled();
    expect(updateAnalysisForReport).toHaveBeenCalledWith(
      "report-1",
      "plot-1",
      expect.objectContaining({
        yColumnId: "c2",
        mark: "line",
        showSpecLimits: true,
      })
    );
    expect(output).toMatchObject({
      status: "ok",
      updated: true,
      yColumnId: "c2",
      mark: "line",
      showSpecLimits: true,
      analysisCount: 1,
    });
  });

  it("creates a worksheet scatter colored by a legend column", async () => {
    const created: XyScatterAnalysisSummary = {
      id: "plot-legend",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: "Assay vs Time by Lot",
      config: {
        xColumnId: "c2",
        xColumnName: "Time",
        yColumnId: "c1",
        yColumnName: "Assay",
        legendColumnId: "c3",
        legendColumnName: "Lot",
        title: "Assay vs Time by Lot",
        mark: "scatter",
        showSpecLimits: false,
      },
      results: { specs: [], n: 3, skipped: 0, pearsonR: null },
      sourceHash: "hash",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    vi.mocked(createAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics: { ...analyticsView(), analyses: [created] },
      analysis: created,
    });
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_xy_scatter?.execute;
    if (!plot) throw new Error("plot_xy_scatter has no execute");
    const output = await plot(
      {
        yColumnId: "c1",
        xColumnId: "c2",
        legendColumnId: "c3",
      },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(createAnalysisForReport).toHaveBeenCalledWith(
      "report-1",
      expect.objectContaining({
        kind: XY_SCATTER,
        yColumnId: "c1",
        xColumnId: "c2",
        legendColumnId: "c3",
      })
    );
    expect(output).toMatchObject({
      status: "ok",
      updated: false,
      legendColumnId: "c3",
      legendColumnName: "Lot",
    });
  });

  it("refuses to edit a non-worksheet Results row via plot_xy_scatter", async () => {
    const initial = analyticsView();
    initial.analyses = [
      {
        id: "plot-ms",
        workspaceId: "ws-1",
        kind: MEASUREMENT_SCATTER,
        title: "M3",
        config: {
          query: "M3-SYS-FN-037",
          title: "M3",
          xLabel: "Observation",
          yLabel: "Value",
          layout: DEFAULT_CHART_LAYOUT,
          lsl: null,
          usl: null,
        },
        results: { specs: [], n: 4, uom: "" },
        sourceHash: "hash",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
    ];
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_xy_scatter?.execute;
    if (!plot) throw new Error("plot_xy_scatter has no execute");
    const output = await plot(
      { analysisId: "plot-ms", mark: "line" },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(updateAnalysisForReport).not.toHaveBeenCalled();
    expect(createAnalysisForReport).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      status: "error",
      message: expect.stringContaining("not a worksheet scatter"),
    });
  });

  it("creates a boxplot Results row via plot_boxplot", async () => {
    const created: BoxplotAnalysisSummary = {
      id: "box-1",
      workspaceId: "ws-1",
      kind: BOXPLOT,
      title: "Boxplot of Assay by Lot",
      config: {
        yColumnId: "c1",
        yColumnName: "Assay",
        categoryColumnIds: ["c2"],
        categoryColumnNames: ["Lot"],
        title: "Boxplot of Assay by Lot",
      },
      results: {
        n: 6,
        skipped: 0,
        groups: [
          {
            labels: ["A"],
            n: 3,
            min: 1,
            q1: 1,
            median: 2,
            q3: 3,
            max: 3,
            whiskerLow: 1,
            whiskerHigh: 3,
            outliers: [],
          },
        ],
      },
      sourceHash: "hash",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    vi.mocked(createAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics: { ...analyticsView(), analyses: [created] },
      analysis: created,
    });
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_boxplot?.execute;
    if (!plot) throw new Error("plot_boxplot has no execute");
    const output = await plot(
      { yColumnId: "c1", categoryColumnIds: ["c2"] },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(createAnalysisForReport).toHaveBeenCalledWith(
      "report-1",
      expect.objectContaining({
        kind: BOXPLOT,
        yColumnId: "c1",
        categoryColumnIds: ["c2"],
      })
    );
    expect(output).toMatchObject({
      status: "ok",
      updated: false,
      analysisId: "box-1",
      yColumnId: "c1",
      groupCount: 1,
      openResultsTab: true,
    });
  });

  it("updates an existing boxplot instead of creating a new Results row", async () => {
    const existing: BoxplotAnalysisSummary = {
      id: "box-1",
      workspaceId: "ws-1",
      kind: BOXPLOT,
      title: "Boxplot of Assay",
      config: {
        yColumnId: "c1",
        yColumnName: "Assay",
        categoryColumnIds: [],
        categoryColumnNames: [],
        title: "Boxplot of Assay",
      },
      results: {
        n: 6,
        skipped: 0,
        groups: [
          {
            labels: [],
            n: 6,
            min: 1,
            q1: 1,
            median: 2,
            q3: 3,
            max: 3,
            whiskerLow: 1,
            whiskerHigh: 3,
            outliers: [],
          },
        ],
      },
      sourceHash: "hash",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const initial = analyticsView();
    initial.analyses = [existing];
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    const updated: BoxplotAnalysisSummary = {
      ...existing,
      config: {
        ...existing.config,
        categoryColumnIds: ["c2"],
        categoryColumnNames: ["Lot"],
        title: "Boxplot of Assay by Lot",
      },
      title: "Boxplot of Assay by Lot",
    };
    vi.mocked(updateAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics: { ...initial, analyses: [updated] },
      analysis: updated,
    });
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_boxplot?.execute;
    if (!plot) throw new Error("plot_boxplot has no execute");
    const output = await plot(
      { analysisId: "box-1", categoryColumnIds: ["c2"] },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(createAnalysisForReport).not.toHaveBeenCalled();
    expect(updateAnalysisForReport).toHaveBeenCalledWith(
      "report-1",
      "box-1",
      expect.objectContaining({ categoryColumnIds: ["c2"] })
    );
    expect(output).toMatchObject({
      status: "ok",
      updated: true,
      categoryColumnIds: ["c2"],
    });
  });

  it("refuses to edit a non-boxplot Results row via plot_boxplot", async () => {
    const existing: XyScatterAnalysisSummary = {
      id: "plot-1",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: "Assay vs Observation",
      config: {
        xColumnId: null,
        xColumnName: "Observation",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: "Assay vs Observation",
        mark: "scatter",
        showSpecLimits: false,
      },
      results: { specs: [], n: 3, skipped: 0, pearsonR: null },
      sourceHash: "hash",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const initial = analyticsView();
    initial.analyses = [existing];
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(initial);
    const tools = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: true,
      documentType: "investigation_report",
    });
    const plot = tools.plot_boxplot?.execute;
    if (!plot) throw new Error("plot_boxplot has no execute");
    const output = await plot(
      { analysisId: "plot-1", yColumnId: "c2" },
      {
        toolCallId: "plot",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(updateAnalysisForReport).not.toHaveBeenCalled();
    expect(createAnalysisForReport).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      status: "error",
      message: expect.stringContaining("not a boxplot"),
    });
  });
});
