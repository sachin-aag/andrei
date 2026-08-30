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
  ChatPanel: function MockChatPanel({ visible = true }: { visible?: boolean }) {
    useEffect(() => {
      chatPanelMounts += 1;
    }, []);
    return (
      <div data-testid="chat-panel" data-visible={visible ? "true" : "false"}>
        chat
      </div>
    );
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
  it("shows only the active tab icon when the sidebar is collapsed", () => {
    renderSidebar(true, "criteria");
    expect(screen.queryByRole("button", { name: "Placeholders" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criteria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("shows all tab buttons when the sidebar is expanded", () => {
    renderSidebar(false, "assistant");
    expect(screen.getByRole("button", { name: "Criteria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Placeholders" })).toBeInTheDocument();
  });

  it("keeps ChatPanel mounted when the sidebar is collapsed", () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-visible",
      "true"
    );

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
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-visible",
      "false"
    );
    expect(screen.getByTestId("chat-panel").parentElement).toHaveClass(
      "invisible"
    );
    expect(screen.getByTestId("chat-panel").parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(chatPanelMounts).toBe(1);

    rerender(
      <ReportSidebar
        collapsed={false}
        onToggleCollapse={noop}
        activeTab="assistant"
        onTabChange={noop}
        onJumpToSection={noop}
        onJumpToPlaceholder={noop}
        onJumpToComment={noop}
      />
    );
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-visible",
      "true"
    );
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "invisible"
    );
    expect(chatPanelMounts).toBe(1);
  });

  it("keeps ChatPanel mounted when switching away from Assistant", () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "invisible"
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
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-visible",
      "false"
    );
    expect(screen.getByTestId("chat-panel").parentElement).toHaveClass(
      "invisible"
    );
    expect(chatPanelMounts).toBe(1);
  });

  it("keeps ChatPanel visible on the Analytics surface", () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

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
        statsEnabled
      />
    );

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-visible",
      "true"
    );
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "invisible"
    );
    expect(screen.queryByRole("button", { name: "Criteria" })).not.toBeInTheDocument();
    expect(chatPanelMounts).toBe(1);
  });
});
