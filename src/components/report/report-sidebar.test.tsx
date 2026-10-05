// @vitest-environment jsdom

import { useEffect, type ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportSidebar } from "@/components/report/report-sidebar";

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (loader: () => Promise<unknown>) => {
      const Lazy = React.lazy(async () => {
        const loaded = await loader();
        if (typeof loaded === "function") {
          return { default: loaded as ComponentType };
        }
        const mod = loaded as { default?: ComponentType } & Record<
          string,
          ComponentType
        >;
        return { default: (mod.default ?? Object.values(mod)[0])! };
      });
      return function DynamicMock(props: Record<string, unknown>) {
        return (
          <React.Suspense fallback={null}>
            <Lazy {...props} />
          </React.Suspense>
        );
      };
    },
  };
});

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

vi.mock("@/components/report/review", () => ({
  Review: {
    Panel: () => <div>review</div>,
  },
  useReview: () => ({
    state: {
      checks: [],
      findings: [],
      category: "all",
      openCheckId: null,
      runningCheckIds: [],
      loading: false,
      canRun: false,
    },
    actions: {
      setCategory: () => {},
      toggleCheck: () => {},
      runChecks: async () => {},
      patchFinding: async () => {},
      refresh: async () => {},
    },
  }),
}));

vi.mock("@/components/report/placeholders-panel", () => ({
  PlaceholdersPanel: () => <div>placeholders</div>,
}));

vi.mock("@/components/report/comments-panel", () => ({
  CommentsPanelContent: () => <div>comments</div>,
}));

const noop = () => {};

function renderSidebar(
  collapsed: boolean,
  activeTab: "assistant" | "review" | "placeholders" | "comments"
) {
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

async function waitForChatPanel() {
  await waitFor(() => {
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });
}

describe("ReportSidebar chat keep-alive", () => {
  it("shows only the active tab icon when the sidebar is collapsed", () => {
    renderSidebar(true, "review");
    expect(screen.queryByRole("button", { name: "Comments" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("shows all tab buttons when the sidebar is expanded", () => {
    renderSidebar(false, "assistant");
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Placeholders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
  });

  it("does not mount ChatPanel until Assistant is first opened", async () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "review");
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-tab-panel")).toHaveTextContent("review");
    });
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(chatPanelMounts).toBe(0);

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
    await waitForChatPanel();
    expect(chatPanelMounts).toBe(1);
  });

  it("keeps ChatPanel mounted when the sidebar is collapsed", async () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    await waitForChatPanel();
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

  it("keeps ChatPanel mounted when switching away from Assistant", async () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    await waitForChatPanel();
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "invisible"
    );

    rerender(
      <ReportSidebar
        collapsed={false}
        onToggleCollapse={noop}
        activeTab="review"
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

  it.each(["review", "placeholders", "comments"] as const)(
    "fills the sidebar with %s instead of leaving empty space above it",
    async (tab) => {
      renderSidebar(false, tab);

      const tabPanel = await screen.findByTestId("sidebar-tab-panel");
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
      expect(tabPanel).toHaveClass("h-full");
      expect(tabPanel).not.toHaveClass("flex-1");
      expect(tabPanel.parentElement).toHaveClass("flex-1");
      await waitFor(() => {
        expect(tabPanel).toHaveTextContent(tab);
      });
    }
  );

  it("does not render a competing tab panel on Assistant", async () => {
    renderSidebar(false, "assistant");
    await waitForChatPanel();
    expect(screen.queryByTestId("sidebar-tab-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-panel").parentElement).not.toHaveClass(
      "absolute"
    );
  });

  it("keeps ChatPanel visible on the Analytics surface", async () => {
    chatPanelMounts = 0;
    const { rerender } = renderSidebar(false, "assistant");
    await waitForChatPanel();

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
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    expect(chatPanelMounts).toBe(1);
  });
});
