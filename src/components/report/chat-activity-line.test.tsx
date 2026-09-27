// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatActivityLine } from "@/components/report/chat-activity-line";
import { documentReviewActivityNode } from "@/lib/ai/chat/chat-activity-ui";

describe("ChatActivityLine", () => {
  it("shows reviewed files next to the complete-review chevron", async () => {
    const user = userEvent.setup();
    const node = documentReviewActivityNode([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "started",
          totalPages: 12,
          documents: [
            {
              attachmentId: "urs",
              filename: "User Requirement Specification.PDF",
              pageCount: 12,
            },
          ],
        },
      },
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 12,
          reviewedPages: 12,
        },
      },
    ]);
    expect(node).not.toBeNull();
    render(<ChatActivityLine node={node!} />);

    expect(
      screen.queryByText("User Requirement Specification.PDF · 12 pages")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Complete: reviewed 12/12 pages in User Requirement Specification.PDF",
      })
    );

    expect(
      screen.getByText("User Requirement Specification.PDF · 12 pages")
    ).toBeInTheDocument();
  });
});
