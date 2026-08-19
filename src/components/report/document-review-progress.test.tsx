// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentReviewProgress } from "@/components/report/document-review-progress";

describe("DocumentReviewProgress", () => {
  it("renders planning, reviewing, and complete states", () => {
    const { rerender, container } = render(
      <DocumentReviewProgress
        parts={[
          {
            toolName: "start_document_review",
            state: "input-available",
            input: { objective: "matrix" },
            output: { totalPages: 62 },
          },
        ]}
      />
    );
    expect(
      screen.getByLabelText("Planning a complete review of 62 pages…")
    ).toBeInTheDocument();

    rerender(
      <DocumentReviewProgress
        parts={[
          {
            toolName: "continue_document_review",
            state: "output-available",
            output: {
              status: "in_progress",
              totalPages: 62,
              reviewedPages: 24,
              findingCount: 18,
            },
          },
        ]}
      />
    );
    expect(
      screen.getByLabelText("Reviewed 24/62 pages · 18 relevant findings")
    ).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();

    rerender(
      <DocumentReviewProgress
        parts={[
          {
            toolName: "finish_document_review",
            state: "output-available",
            output: {
              status: "complete",
              totalPages: 62,
              reviewedPages: 62,
            },
          },
        ]}
      />
    );
    expect(
      screen.getByLabelText("Complete: reviewed 62/62 pages")
    ).toBeInTheDocument();
  });
});
