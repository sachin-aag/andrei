// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QSR_SECTION_EDITORS } from "@/components/report/sections/qsr/qsr-section-editors";

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/hooks/use-generic-section-save", () => ({
  useGenericSectionSave: () => ({
    status: "idle",
    lastSavedAt: null,
    value: undefined,
    flushSave: vi.fn(),
  }),
}));

vi.mock("@/components/report/tiptap-section-field", () => ({
  TiptapSectionField: ({ label }: { label?: string }) => (
    <div data-testid="tiptap-field" data-label={label ?? ""} />
  ),
}));

vi.mock("@/components/report/suggestion-card", () => ({
  SectionSuggestionCard: () => null,
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
      documentType: "qualification_summary_report",
      authorId: "user-1",
      status: "draft",
      metadata: {},
    },
    currentUserId: "user-1",
    workspaceMode: "edit",
    readOnly: false,
  }),
  useReportEvaluations: () => ({
    evaluations: [],
    runningEvalSections: [],
    generateSuggestions: vi.fn(),
    runEvaluation: vi.fn(),
    isEvaluating: false,
    isSuggesting: false,
    runningSuggestionSections: [],
  }),
  useReportComments: () => ({ comments: [] }),
  useReportSections: () => ({ sections: {} }),
  useGenericReportSection: () => ({
    value: undefined,
    update: vi.fn(),
    replace: vi.fn(),
  }),
}));

function descriptionUnder(heading: string): string | undefined {
  const title = screen.getByRole("heading", { name: heading });
  const sibling = title.nextElementSibling;
  return sibling?.textContent ?? undefined;
}

describe("QSR section editors", () => {
  it("does not show helper copy under 6.1 or 6.2", () => {
    const Volumetric = QSR_SECTION_EDITORS.qsr_volumetric_details;
    const { unmount } = render(<Volumetric />);
    expect(
      screen.getByRole("heading", { name: "6.1 Volumetric Details" })
    ).toBeInTheDocument();
    expect(descriptionUnder("6.1 Volumetric Details")).toBeUndefined();
    unmount();

    const Operating = QSR_SECTION_EDITORS.qsr_operating_range;
    render(<Operating />);
    expect(
      screen.getByRole("heading", { name: "6.2 Operating Range" })
    ).toBeInTheDocument();
    expect(descriptionUnder("6.2 Operating Range")).toBeUndefined();
  });

  it("keeps merge hints on other table sections", () => {
    const QualDocs = QSR_SECTION_EDITORS.qsr_qualification_documents;
    const { unmount } = render(<QualDocs />);
    expect(descriptionUnder("3 Qualification Documents")).toMatch(/Merge/);
    unmount();

    const Process = QSR_SECTION_EDITORS.qsr_rtm_process;
    render(<Process />);
    expect(descriptionUnder("5.1 Process Requirements")).toMatch(
      /Keep the header columns unchanged/
    );
  });
});
