import { describe, expect, it, vi } from "vitest";

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
  ANALYTICS_CHAT_TOOL_NAMES,
  buildAnalyticsChatTools,
  extractNumericTokens,
  pickAnalyticsDocumentTools,
} from "./chat-tools";

describe("analytics chat tools", () => {
  it("never exposes drafting or report-edit tools", () => {
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("propose_edit");
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("draft_field");
    expect(ANALYTICS_CHAT_TOOL_NAMES).not.toContain("read_section");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("search_documents");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("write_column");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("run_capability_sixpack");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("run_one_way_anova");
    expect(ANALYTICS_CHAT_TOOL_NAMES).toContain("plot_measurements");
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
    expect(writable.run_one_way_anova).toBeDefined();
    expect(writable.plot_measurements).toBeDefined();

    const locked = buildAnalyticsChatTools({
      reportId: "report-1",
      canEdit: false,
      documentType: "investigation_report",
    });
    expect(locked.write_column).toBeUndefined();
    expect(locked.run_capability_sixpack).toBeUndefined();
    expect(locked.run_one_way_anova).toBeUndefined();
    expect(locked.plot_measurements).toBeUndefined();
    expect(locked.search_documents).toBeDefined();
  });

  it("extracts finite numeric tokens and stops at the worksheet cap", () => {
    expect(extractNumericTokens("Assay 101.84 103.12 n/a 99.4e0")).toEqual([
      101.84, 103.12, 99.4,
    ]);
    expect(extractNumericTokens("no numbers here")).toEqual([]);
  });
});
