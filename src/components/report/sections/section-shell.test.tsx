// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionShell } from "@/components/report/sections/section-shell";

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/providers/user-directory-provider", () => ({
  useUserDirectory: () => ({
    getUser: () => ({ id: "user-1", role: "engineer" }),
  }),
}));

vi.mock("@/components/report/suggestion-card", () => ({
  SectionSuggestionCard: () => null,
}));

vi.mock("@/providers/report-provider", () => {
  const evaluations: unknown[] = [];
  return {
    useReportData: () => ({
      report: {
        id: "report-1",
        documentType: "investigation_report",
        authorId: "user-1",
        status: "draft",
        metadata: {},
      },
      currentUserId: "user-1",
      workspaceMode: "edit",
    }),
    useReportEvaluations: () => ({
      evaluations,
      runningEvalSections: [],
      generateSuggestions: vi.fn(),
      runEvaluation: vi.fn(),
      isEvaluating: false,
      isSuggesting: false,
      runningSuggestionSections: [],
    }),
    useReportComments: () => ({ comments: [] }),
    useReportSections: () => ({ sections: { define: {} } }),
  };
});

describe("SectionShell AI actions", () => {
  it("keeps Run criteria in the section header and does not put Suggest fixes beside it", () => {
    render(
      <SectionShell title="Define" section="define">
        <p>body</p>
      </SectionShell>
    );

    expect(screen.getByRole("heading", { name: "Define" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run criteria/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suggest fixes" })
    ).not.toBeInTheDocument();
  });
});
