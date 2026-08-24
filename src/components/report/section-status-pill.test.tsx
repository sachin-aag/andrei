// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SectionRunEvaluationButton,
  SectionStatusPill,
} from "@/components/report/section-status-pill";
import type { WorkspaceMode } from "@/providers/report-provider";

const {
  generateSuggestions,
  canSuggestFixesMock,
  mockState,
} = vi.hoisted(() => ({
  generateSuggestions: vi.fn(async () => {}),
  canSuggestFixesMock: vi.fn(() => false),
  mockState: {
    workspaceMode: "edit" as WorkspaceMode,
    runningSuggestionSections: [] as string[],
    isEvaluating: false,
    isSuggesting: false,
    evaluations: [] as unknown[],
  },
}));

vi.mock("@/lib/ai/suggestion-gating", () => ({
  canSuggestFixes: canSuggestFixesMock,
}));

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/providers/user-directory-provider", () => ({
  useUserDirectory: () => ({
    getUser: () => ({ id: "user-1", role: "engineer" }),
  }),
}));

vi.mock("@/providers/report-provider", () => ({
  useReportData: () => ({
    report: {
      id: "report-1",
      documentType: "investigation_report",
      authorId: "user-1",
      status: "draft",
      metadata: {},
    },
    currentUserId: "user-1",
    workspaceMode: mockState.workspaceMode,
  }),
  useReportEvaluations: () => ({
    evaluations: mockState.evaluations,
    runningEvalSections: [],
    generateSuggestions,
    runEvaluation: vi.fn(),
    isEvaluating: mockState.isEvaluating,
    isSuggesting: mockState.isSuggesting,
    runningSuggestionSections: mockState.runningSuggestionSections,
  }),
  useReportComments: () => ({ comments: [] }),
  useReportSections: () => ({ sections: { define: {} } }),
}));

async function openCriteriaDropdown() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { expanded: false }));
  return user;
}

describe("SectionStatusPill Suggest fixes", () => {
  beforeEach(() => {
    generateSuggestions.mockReset();
    canSuggestFixesMock.mockReset();
    canSuggestFixesMock.mockReturnValue(false);
    mockState.workspaceMode = "edit";
    mockState.runningSuggestionSections = [];
    mockState.isEvaluating = false;
    mockState.isSuggesting = false;
  });

  it("does not show Suggest fixes on the collapsed dropdown", async () => {
    canSuggestFixesMock.mockReturnValue(true);
    render(<SectionStatusPill section="define" />);

    expect(
      screen.queryByRole("button", { name: "Suggest fixes" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("shows Suggest fixes inside the open dropdown when it can run", async () => {
    canSuggestFixesMock.mockReturnValue(true);
    render(<SectionStatusPill section="define" />);

    await openCriteriaDropdown();

    const suggest = screen.getByRole("button", { name: "Suggest fixes" });
    expect(suggest).toBeEnabled();
    expect(screen.getByText("Clearly define what happened actually")).toBeInTheDocument();
  });

  it("hides Suggest fixes when it cannot run, even with the dropdown open", async () => {
    canSuggestFixesMock.mockReturnValue(false);
    render(<SectionStatusPill section="define" />);

    await openCriteriaDropdown();

    expect(screen.getByText("Clearly define what happened actually")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suggest fixes" })
    ).not.toBeInTheDocument();
  });

  it("hides Suggest fixes in view mode even when it could otherwise run", async () => {
    mockState.workspaceMode = "view";
    canSuggestFixesMock.mockReturnValue(true);
    render(<SectionStatusPill section="define" />);

    await openCriteriaDropdown();

    expect(
      screen.queryByRole("button", { name: "Suggest fixes" })
    ).not.toBeInTheDocument();
  });

  it("keeps Suggesting… visible while generation is in flight", async () => {
    canSuggestFixesMock.mockReturnValue(false);
    mockState.runningSuggestionSections = ["define"];
    render(<SectionStatusPill section="define" />);

    await openCriteriaDropdown();

    const suggesting = screen.getByRole("button", { name: "Suggesting fixes" });
    expect(suggesting).toBeDisabled();
    expect(suggesting).toHaveAttribute("aria-busy", "true");
  });

  it("calls generateSuggestions from the dropdown button", async () => {
    canSuggestFixesMock.mockReturnValue(true);
    render(<SectionStatusPill section="define" />);

    const user = await openCriteriaDropdown();
    await user.click(screen.getByRole("button", { name: "Suggest fixes" }));

    expect(generateSuggestions).toHaveBeenCalledTimes(1);
    expect(generateSuggestions).toHaveBeenCalledWith("define");
  });
});

describe("SectionRunEvaluationButton", () => {
  it("still renders Run criteria as its own control", () => {
    render(<SectionRunEvaluationButton section="define" />);
    expect(screen.getByRole("button", { name: /Run criteria/ })).toBeInTheDocument();
  });
});
