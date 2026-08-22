// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportSidebar } from "@/components/report/report-sidebar";

vi.mock("@/providers/report-provider", () => ({
  useReportPlaceholders: () => ({ pendingPlaceholders: [] }),
  useReportComments: () => ({ comments: [] }),
}));

vi.mock("@/components/report/chat-panel", () => ({
  ChatPanel: () => <div data-testid="chat-panel">chat</div>,
}));

vi.mock("@/components/report/placeholders-panel", () => ({
  PlaceholdersPanelContent: () => <div>placeholders</div>,
}));

vi.mock("@/components/report/criteria-sheet", () => ({
  CriteriaPanelContent: () => <div>criteria</div>,
  CommentsPanelContent: () => <div>comments</div>,
}));

const noop = () => {};

function renderSidebar(collapsed: boolean, activeTab: "assistant" | "criteria") {
  return render(
    <ReportSidebar
      collapsed={collapsed}
      onToggleCollapse={noop}
      activeTab={activeTab}
      onTabChange={noop}
      onJumpToSection={noop}
      onJumpToPlaceholder={noop}
      onJumpToComment={noop}
    />
  );
}

describe("ReportSidebar chat keep-alive", () => {
  it("keeps ChatPanel mounted when the sidebar is collapsed", () => {
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    rerender(
      <ReportSidebar
        collapsed
        onToggleCollapse={noop}
        activeTab="assistant"
        onTabChange={noop}
        onJumpToSection={noop}
        onJumpToPlaceholder={noop}
        onJumpToComment={noop}
      />
    );

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).toHaveClass("hidden");
  });

  it("keeps ChatPanel mounted when switching away from Assistant", () => {
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "hidden"
    );

    rerender(
      <ReportSidebar
        collapsed={false}
        onToggleCollapse={noop}
        activeTab="criteria"
        onTabChange={noop}
        onJumpToSection={noop}
        onJumpToPlaceholder={noop}
        onJumpToComment={noop}
      />
    );

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).toHaveClass("hidden");
  });
});
