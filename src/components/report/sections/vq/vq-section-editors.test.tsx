// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VQ_SECTION_EDITORS } from "@/components/report/sections/vq/vq-section-editors";

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/hooks/use-generic-section-save", () => ({
  useGenericSectionSave: () => ({
    status: "idle",
    lastSavedAt: null,
    value: { answers: {} },
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
      documentType: "vendor_qualification",
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
  useReportSections: () => ({ sections: { vq_section_a: { answers: {} } } }),
  useGenericReportSection: () => ({
    value: { answers: {} },
    update: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("VQ section editors", () => {
  it("renders company-structure questions in sentence case with one required star", () => {
    const Editor = VQ_SECTION_EDITORS.vq_section_a;
    render(<Editor />);

    const structure = screen.getByTestId("vq-field-a_1_6_2");
    expect(structure).toHaveTextContent(
      "1.6.2 * Please give a brief structure-diagram"
    );
    expect(structure).not.toHaveTextContent("* *Please");
    expect(structure).not.toHaveTextContent("PLEASE GIVE A BRIEF");

    const label = structure.querySelector("label");
    expect(label?.className).toContain("normal-case");
    expect(label?.className).not.toMatch(/(?:^|\s)uppercase(?:\s|$)/);

    expect(screen.getByTestId("vq-field-a_1_6_3")).toHaveTextContent(
      "1.6.3 * Do you expect a change of the legal status and/or ownership of your company in the near future?"
    );
    expect(screen.getByTestId("vq-field-a_1_6_5")).toHaveTextContent(
      "1.6.5 If yes, please enclose the annual report / Sustainable report / declaration"
    );
  });

  it("shows the fields that were missing from the old form", () => {
    const Cover = VQ_SECTION_EDITORS.vq_cover;
    const { unmount } = render(<Cover />);
    expect(screen.getByTestId("vq-field-cover_filled_by")).toHaveTextContent(
      "3XPER INNOVENTURE LTD"
    );
    expect(screen.getByLabelText("Key Starting Material (KSM)")).toBeInTheDocument();
    const signatures = screen.getByTestId("vq-page-signatures");
    expect(signatures).toHaveTextContent("Name of the Activity");
    expect(screen.getByLabelText("Name row 1")).toHaveValue("Anantha Kumar D");
    expect(screen.getByLabelText("Name of the Activity row 3")).toHaveValue(
      "Approved By"
    );
    unmount();

    const SectionB = VQ_SECTION_EDITORS.vq_section_b;
    render(<SectionB />);
    expect(screen.getByTestId("vq-field-b_1_7")).toBeInTheDocument();
    expect(screen.getByLabelText("To the slaughterhouse?")).toBeInTheDocument();
  });
});
