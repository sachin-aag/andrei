// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatActivityLine } from "@/components/report/chat-activity-line";
import {
  documentReviewActivityNode,
  type ActivitySurfaceNode,
} from "@/lib/ai/chat/chat-activity-ui";

const pendingThought: ActivitySurfaceNode = {
  kind: "thought",
  label: "Thinking…",
  pending: true,
  tone: "muted",
  expandable: true,
  children: [],
  thoughtText: "Considering the next edit.",
};

describe("ChatActivityLine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("labels a pending thought so the chevron is not an empty row", () => {
    render(<ChatActivityLine node={pendingThought} />);

    expect(
      screen.getByRole("button", { name: "Thinking…" })
    ).toBeInTheDocument();
    expect(screen.getByText("Thinking…").className).toContain(
      "chat-activity-glimmer"
    );
  });

  it("keeps Thinking on a pending thought after a second elapses", () => {
    vi.useFakeTimers();
    render(<ChatActivityLine node={pendingThought} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen.getByRole("button", { name: "Thinking… 1s" })
    ).toBeInTheDocument();
  });
});
