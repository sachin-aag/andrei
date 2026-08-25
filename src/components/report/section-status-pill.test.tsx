// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SectionRunEvaluationButton,
  SectionStatusPill,
  isCompletelyAboveScroller,
  keepViewportAfterGrowth,
  nearestVerticalScroller,
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
    runningEvalSections: [] as string[],
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
    runningEvalSections: mockState.runningEvalSections,
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
    mockState.runningEvalSections = [];
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

describe("SectionStatusPill auto-open after Run criteria", () => {
  beforeEach(() => {
    mockState.runningEvalSections = [];
  });

  it("stays collapsed on first paint when evaluation is not running", () => {
    render(<SectionStatusPill section="define" />);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(
      screen.queryByText("Clearly define what happened actually")
    ).not.toBeInTheDocument();
  });

  it("opens this section's dropdown when its criteria run finishes", () => {
    mockState.runningEvalSections = ["define"];
    const { rerender } = render(<SectionStatusPill section="define" />);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();

    mockState.runningEvalSections = [];
    rerender(<SectionStatusPill section="define" />);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(
      screen.getByText("Clearly define what happened actually")
    ).toBeInTheDocument();
  });

  it("does not open when a different section's run finishes", () => {
    mockState.runningEvalSections = ["measure"];
    const { rerender } = render(<SectionStatusPill section="define" />);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();

    mockState.runningEvalSections = [];
    rerender(<SectionStatusPill section="define" />);

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(
      screen.queryByText("Clearly define what happened actually")
    ).not.toBeInTheDocument();
  });
});

function mockRect(
  top: number,
  bottom: number
): () => DOMRect {
  return () =>
    ({
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("criteria dropdown scroll helpers", () => {
  it("finds the nearest overflow-y scroller", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const child = document.createElement("div");
    const inner = document.createElement("div");
    scroller.append(child);
    child.append(inner);
    document.body.append(scroller);

    expect(nearestVerticalScroller(inner)).toBe(scroller);
    scroller.remove();
  });

  it("treats the pill as scrolled-away only when it is fully above the scroller", () => {
    const el = document.createElement("div");
    const scroller = document.createElement("div");
    el.getBoundingClientRect = mockRect(-200, -40);
    scroller.getBoundingClientRect = mockRect(80, 800);
    expect(isCompletelyAboveScroller(el, scroller)).toBe(true);

    el.getBoundingClientRect = mockRect(100, 140);
    expect(isCompletelyAboveScroller(el, scroller)).toBe(false);

    el.getBoundingClientRect = mockRect(900, 960);
    expect(isCompletelyAboveScroller(el, scroller)).toBe(false);
  });

  it("shifts scrollTop by the height growth so the viewport does not jump back", () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollTop", {
      writable: true,
      value: 500,
    });
    keepViewportAfterGrowth(scroller, 40, 240, 500);
    expect(scroller.scrollTop).toBe(700);
  });

  it("leaves scrollTop alone when height did not change", () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollTop", {
      writable: true,
      value: 500,
    });
    keepViewportAfterGrowth(scroller, 40, 40, 500);
    expect(scroller.scrollTop).toBe(500);
  });
});
