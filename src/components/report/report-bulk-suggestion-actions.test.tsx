// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportBulkSuggestionActions } from "./report-bulk-suggestion-actions";
import type { CommentRecord } from "@/types/report";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";

const mockState = vi.hoisted(() => ({
  comments: [] as CommentRecord[],
  documentType: "qualification_summary_report" as const,
  closeSuggestionComments: vi.fn(),
  releaseSuggestionComments: vi.fn(),
  acceptAll: vi.fn(),
  dismissAll: vi.fn(),
}));

function aiComment(
  overrides: Partial<CommentRecord> & Pick<CommentRecord, "id" | "section">
): CommentRecord {
  return {
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    authorId: "ai",
    content: serializeAiFixCommentContent({
      deleteText: "",
      insertText: " leftover",
      reasoning: "",
    }),
    anchorText: "URS",
    contentPath: "table",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    ...overrides,
  };
}

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/lib/suggestions/bulk-suggestions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/suggestions/bulk-suggestions")>();
  return {
    ...actual,
    acceptAllSuggestionsInReport: (...args: unknown[]) =>
      mockState.acceptAll(...args),
    dismissAllSuggestionsInReport: (...args: unknown[]) =>
      mockState.dismissAll(...args),
  };
});

vi.mock("@/providers/user-directory-provider", () => ({
  useUserDirectory: () => ({
    getUser: () => ({ id: "user-1", role: "engineer" }),
  }),
}));

vi.mock("@/providers/report-provider", () => ({
  useReportData: () => ({
    report: {
      id: "report-1",
      documentType: mockState.documentType,
      authorId: "user-1",
      status: "draft",
    },
    readOnly: false,
    currentUserId: "user-1",
    refresh: vi.fn(),
    closeSuggestionComments: mockState.closeSuggestionComments,
    releaseSuggestionComments: mockState.releaseSuggestionComments,
    markSectionPersisted: vi.fn(),
  }),
  useReportComments: () => ({
    comments: mockState.comments,
    setComments: vi.fn(),
  }),
  useReportSections: () => ({
    sections: {
      qsr_objective: { narrative: { type: "doc", content: [] } },
      qsr_acronyms: { table: { type: "doc", content: [] } },
    },
    replaceSection: vi.fn(),
  }),
  useReportEvaluations: () => ({
    evaluations: [],
    beginSuggestionApplyTransition: vi.fn(),
    endSuggestionApplyTransition: vi.fn(),
  }),
}));

describe("ReportBulkSuggestionActions leftover suggestions", () => {
  beforeEach(() => {
    mockState.comments = [];
    mockState.documentType = "qualification_summary_report";
    mockState.closeSuggestionComments.mockReset();
    mockState.releaseSuggestionComments.mockReset();
    mockState.acceptAll.mockReset();
    mockState.dismissAll.mockReset();
  });

  it("hides the row when nothing is open", () => {
    render(<ReportBulkSuggestionActions />);
    expect(
      screen.queryByTestId("report-bulk-suggestion-actions")
    ).not.toBeInTheDocument();
  });

  it("keeps Dismiss all after the last evaluatable suggestion is gone", () => {
    mockState.comments = [
      aiComment({ id: "acro", section: "qsr_acronyms" }),
    ];
    render(<ReportBulkSuggestionActions />);
    expect(screen.getByTestId("report-bulk-suggestion-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^apply all 1$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^dismiss all$/i })).toBeInTheDocument();
  });

  it("keeps Apply all / Dismiss all when one of two open suggestions remains", () => {
    mockState.comments = [
      aiComment({
        id: "obj",
        section: "qsr_objective",
        contentPath: "narrative",
        anchorText: "This report",
        content: serializeAiFixCommentContent({
          deleteText: "",
          insertText: " for GLR-1301",
          reasoning: "",
        }),
      }),
      aiComment({ id: "acro", section: "qsr_acronyms" }),
    ];
    const { rerender } = render(<ReportBulkSuggestionActions />);
    expect(screen.getByTestId("report-bulk-suggestion-actions")).toBeInTheDocument();

    mockState.comments = [aiComment({ id: "acro", section: "qsr_acronyms" })];
    rerender(<ReportBulkSuggestionActions />);
    expect(screen.getByTestId("report-bulk-suggestion-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^dismiss all$/i })).toBeInTheDocument();
  });

  it("closes open cards before Apply all so a stale refresh cannot resurrect them", async () => {
    mockState.comments = [
      aiComment({ id: "acro", section: "qsr_acronyms" }),
    ];
    mockState.acceptAll.mockResolvedValue({
      appliedIds: ["acro"],
      skippedIds: [],
      failedIds: [],
      dismissedIds: [],
      changedSections: ["qsr_acronyms"],
    });
    render(<ReportBulkSuggestionActions />);
    screen.getByRole("button", { name: /^apply all 1$/i }).click();
    expect(mockState.closeSuggestionComments).toHaveBeenCalledWith(["acro"]);
    await waitFor(() => {
      expect(mockState.releaseSuggestionComments).toHaveBeenCalledWith([]);
    });
  });

  it("releases leftovers Apply all skipped so they can reappear", async () => {
    mockState.comments = [
      aiComment({ id: "applied", section: "qsr_objective", contentPath: "narrative" }),
      aiComment({ id: "skipped", section: "qsr_acronyms" }),
    ];
    mockState.acceptAll.mockResolvedValue({
      appliedIds: ["applied"],
      skippedIds: ["skipped"],
      failedIds: [],
      dismissedIds: [],
      changedSections: ["qsr_objective"],
    });
    render(<ReportBulkSuggestionActions />);
    screen.getByRole("button", { name: /^apply all 2$/i }).click();
    expect(mockState.closeSuggestionComments).toHaveBeenCalledWith([
      "applied",
      "skipped",
    ]);
    await waitFor(() => {
      expect(mockState.releaseSuggestionComments).toHaveBeenCalledWith([
        "skipped",
      ]);
    });
  });
});
