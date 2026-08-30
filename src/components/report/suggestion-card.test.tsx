// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SuggestionCardFace,
  SuggestionQueueBridgeCard,
  suggestionQueueBridgeCopy,
  type FrozenCard,
} from "@/components/report/suggestion-card";
import type { CommentRecord } from "@/types/report";

const comment: CommentRecord = {
  id: "c1",
  reportId: "r1",
  parentId: null,
  sectionId: "sec",
  section: "define",
  authorId: "ai",
  content: "{}",
  anchorText: "a deviation was observed",
  contentPath: "narrative",
  fromPos: 0,
  toPos: 1,
  status: "open",
  kind: "ai_fix",
  source: "app",
  externalAuthorName: null,
  externalAuthorInitials: null,
  externalCommentId: null,
  externalCreatedAt: null,
  locked: false,
  evaluationId: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const locatable = {
  locateStatus: "locatable" as const,
  documentChanged: false,
  canApply: true,
  canPreview: true,
};

function renderFixCard(card: FrozenCard) {
  return render(
    <SuggestionCardFace
      card={card}
      phase="steady"
      showActions
      pending={false}
      validation={locatable}
      queueStaleHint={null}
      canResolve
      onAccept={() => {}}
      onDismiss={() => {}}
    />
  );
}

describe("SuggestionCardFace", () => {
  it("shows the change summary without duplicating insert or delete text", () => {
    const deleteText = "a deviation was observed during testing";
    const insertText = " on filling line FL-02";
    renderFixCard({
      kind: "fix",
      comment,
      linkedEval: undefined,
      queueIndex: 1,
      queueTotal: 2,
      payload: {
        deleteText,
        insertText,
        reasoning: "Name the filling line in Define.",
      },
    });

    expect(screen.getByTestId("suggestion-change-summary")).toHaveTextContent(
      "Name the filling line in Define."
    );
    expect(screen.queryByText(deleteText)).not.toBeInTheDocument();
    expect(screen.queryByText(insertText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("keeps Apply and Dismiss on one non-wrapping row", () => {
    renderFixCard({
      kind: "fix",
      comment,
      linkedEval: undefined,
      queueIndex: 1,
      queueTotal: 1,
      payload: {
        deleteText: "",
        insertText: "ignored insert",
        reasoning: "Clarify the batch number.",
      },
    });

    const row = screen.getByTestId("suggestion-action-row");
    expect(row.className).toContain("flex-nowrap");
    expect(row.className).not.toContain("flex-wrap");
  });

  it("summarizes a table edit without listing cell text", () => {
    renderFixCard({
      kind: "fix",
      comment,
      linkedEval: undefined,
      queueIndex: 1,
      queueTotal: 1,
      payload: {
        deleteText: "",
        insertText: "",
        reasoning: "Fill the assay result.",
        tableOperation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 2,
              expectedText: "pending",
              insertText: "98.4% w/w",
            },
          ],
        },
      },
    });

    expect(screen.getByText("Update 1 table cell")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-change-summary")).toHaveTextContent(
      "Fill the assay result."
    );
    expect(screen.queryByText(/98\.4% w\/w/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();
  });

  it("does not dump a redraft body into the gutter card", () => {
    renderFixCard({
      kind: "redraft",
      comment: { ...comment, kind: "ai_redraft", contentPath: "narrative" },
      linkedEval: undefined,
      queueIndex: 1,
      queueTotal: 1,
      redraft: {
        markdown: "On 01 Jan 2026 the filling line FL-02 failed the in-process check.",
        reasoning: "Rewrite Define with the missing equipment and date.",
      },
    });

    expect(screen.getByText(/Replaces the entire field/)).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-change-summary")).toHaveTextContent(
      "Rewrite Define with the missing equipment and date."
    );
    expect(
      screen.queryByText(/filling line FL-02 failed the in-process check/)
    ).not.toBeInTheDocument();
  });
});

describe("SuggestionQueueBridgeCard", () => {
  it("offers Go to next and Dismiss", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={2}
        pending={false}
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /go to next/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("calls onGo or onDismiss, and not the other", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <SuggestionQueueBridgeCard
        remainingTotal={1}
        pending={false}
        onGo={onGo}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole("button", { name: /go to next/i }));
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(
      <SuggestionQueueBridgeCard
        remainingTotal={1}
        pending={false}
        onGo={onGo}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it("names the other section when the next card is not in this one", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={2}
        nextSectionLabel="Measure"
        pending={false}
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(
      screen.getByText("2 suggestions remaining — next is in Measure.")
    ).toBeInTheDocument();
  });

  it("disables both actions while the jump is in flight", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={3}
        pending
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /go to next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeDisabled();
  });
});

describe("suggestionQueueBridgeCopy", () => {
  it("describes a same-section remainder", () => {
    expect(suggestionQueueBridgeCopy(1, null)).toBe(
      "1 suggestion remaining farther in this section."
    );
  });

  it("describes a remainder in another section", () => {
    expect(suggestionQueueBridgeCopy(1, "Measure")).toBe(
      "1 suggestion remaining in Measure."
    );
  });
});
