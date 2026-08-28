// @vitest-environment jsdom

import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportSidebar } from "@/components/report/report-sidebar";

vi.mock("@/providers/report-provider", () => ({
  useReportPlaceholders: () => ({ pendingPlaceholders: [] }),
  useReportComments: () => ({ comments: [] }),
  useReportData: () => ({
    report: { id: "report-1", documentType: "investigation_report" },
  }),
}));

let chatPanelMounts = 0;

vi.mock("@/components/report/chat-panel", () => ({
  ChatPanel: function MockChatPanel() {
    useEffect(() => {
      chatPanelMounts += 1;
    }, []);
    return <div data-testid="chat-panel">chat</div>;
  },
}));

vi.mock("@/components/statistical-analysis/analytics-chat-panel", () => ({
  AnalyticsChatPanel: function MockAnalyticsChatPanel() {
    return <div data-testid="analytics-chat-panel">analytics chat</div>;
  },
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
    chatPanelMounts = 0;
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
    expect(chatPanelMounts).toBe(1);
  });

  it("keeps ChatPanel mounted when switching away from Assistant", () => {
    chatPanelMounts = 0;
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
    expect(chatPanelMounts).toBe(1);
  });

  it("keeps ChatPanel mounted and shows analytics chat on the Analytics surface", () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-chat-panel")).not.toBeInTheDocument();

    rerender(
      <ReportSidebar
        collapsed={false}
        onToggleCollapse={noop}
        activeTab="assistant"
        onTabChange={noop}
        onJumpToSection={noop}
        onJumpToPlaceholder={noop}
        onJumpToComment={noop}
        workProductView="analytics"
        analyticsOpen
      />
    );

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).toHaveClass("hidden");
    expect(screen.getByTestId("analytics-chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-chat-panel").parentElement).not.toHaveClass(
      "hidden"
    );
    expect(screen.queryByRole("button", { name: "Criteria" })).not.toBeInTheDocument();
    expect(chatPanelMounts).toBe(1);
  });
});
