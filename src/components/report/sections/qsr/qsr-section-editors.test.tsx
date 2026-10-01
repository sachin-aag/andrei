// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QSR_SECTION_EDITORS } from "@/components/report/sections/qsr/qsr-section-editors";
import {
  QSR_SECTION_KEYS,
  QSR_SECTION_LABELS,
} from "@/lib/document-types/qsr/sections";

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
  it("does not show merge helper copy under any section heading", () => {
    for (const key of QSR_SECTION_KEYS) {
      const Editor = QSR_SECTION_EDITORS[key];
      const { unmount } = render(<Editor />);
      const heading = QSR_SECTION_LABELS[key];
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(descriptionUnder(heading)).toBeUndefined();
      expect(screen.queryByText(/Merge/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Keep the header columns unchanged/)
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
