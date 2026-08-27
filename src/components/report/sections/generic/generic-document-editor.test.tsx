// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GenericDocumentEditor } from "@/components/report/sections/generic/generic-document-editor";

beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
  if (typeof MutationObserver === "undefined") {
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
  }
});

vi.mock("@/hooks/use-generic-section-save", () => ({
  useGenericSectionSave: () => ({
    status: "idle",
    lastSavedAt: null,
    value: { narrative: { type: "doc", content: [] } },
    flushSave: vi.fn(),
  }),
}));

vi.mock("@/components/report/tiptap-section-field", () => ({
  TiptapSectionField: ({
    chrome,
    label,
  }: {
    chrome?: string;
    label?: string;
  }) => (
    <div
      data-testid="tiptap-field"
      data-chrome={chrome ?? "input"}
      data-label={label ?? ""}
    />
  ),
}));

vi.mock("@/components/report/suggestion-card", () => ({
  SectionSuggestionCard: ({ section }: { section: string }) => (
    <div data-testid="mobile-suggestion-card" data-section={section} />
  ),
}));

vi.mock("@/providers/report-provider", () => ({
  useReportData: () => ({
    report: {
      id: "report-1",
      documentNo: "test blank doc",
      documentType: "generic_document",
      metadata: {},
    },
  }),
  useGenericReportSection: () => ({
    value: { narrative: { type: "doc", content: [] } },
    update: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("GenericDocumentEditor", () => {
  it("titles the page with the document number and hides Body / helper copy", () => {
    render(<GenericDocumentEditor />);

    expect(
      screen.getByRole("heading", { name: "test blank doc" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Document" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/continuous Word-like body/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Body$/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("paged-document")).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: /citations/i })
    ).not.toBeInTheDocument();

    const field = screen.getByTestId("tiptap-field");
    expect(field).toHaveAttribute("data-chrome", "page");
    expect(field).toHaveAttribute("data-label", "");
    expect(screen.getByTestId("mobile-suggestion-card")).toHaveAttribute(
      "data-section",
      "body"
    );
  });
});
