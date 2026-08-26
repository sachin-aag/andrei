import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/attachments/retrieval", () => ({
  listDocumentPagesForReview: vi.fn(),
  listReadyDocumentsForReport: vi.fn(),
  readDocumentPage: vi.fn(),
}));

vi.mock("@/lib/ai/chat/tools", () => ({
  buildChatTools: vi.fn(() => ({
    search_documents: { kind: "search" },
    read_document_page: { kind: "page" },
    document_outline: { kind: "outline" },
    ask_user: { kind: "ask" },
    propose_edit: { kind: "edit" },
    draft_field: { kind: "draft" },
    read_section: { kind: "section" },
  })),
}));

vi.mock("@/lib/ai/chat/model", () => ({
  resolveChatExtractLanguageModel: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  createAnalysisForReport: vi.fn(),
  getOrCreateReportAnalytics: vi.fn(),
  updateReportAnalytics: vi.fn(),
}));

import {
  listReadyDocumentsForReport,
  readDocumentPage,
} from "@/lib/attachments/retrieval";
import {
  ANALYTICS_CHAT_TOOL_NAMES,
  buildAnalyticsChatTools,
  extractNumericTokens,
  pickAnalyticsDocumentTools,
} from "./chat-tools";
import { P1_PUW_COMBINED_TRANSCRIPT, P1_PUW_FILENAME } from "@/lib/extraction/__fixtures__/p1-puw-qualification-phase-ii";
import { AMBIGUOUS_METRIC_REQUEST_MESSAGE } from "@/lib/extraction/metric-series";
import { buildAnalyticsChatSystemPrompt } from "./chat-prompt";
import type { ReportAnalyticsView } from "./types";

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
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("run_capability_sixpack");
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
    expect(writable.run_capability_sixpack).toBeDefined();

    const locked = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: false,
      documentType: "investigation_report",
    });
    expect(locked.write_column).toBeUndefined();
    expect(locked.run_capability_sixpack).toBeUndefined();
    expect(locked.search_documents).toBeDefined();
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
      },
      analyses: [],
    } as unknown as ReportAnalyticsView;
    const prompt = buildAnalyticsChatSystemPrompt({
      documentNo: "Trend Water",
      status: "draft",
      documents: [],
      analytics: emptyAnalytics,
      canEdit: true,
    });
    expect(prompt).toContain("ask_user");
    expect(prompt).toContain('Never pass "A or B" to extract_numeric_series');
    expect(prompt).toContain("copy the dates array from that same extract");
  });
});
