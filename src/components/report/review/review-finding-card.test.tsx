// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewFindingCard } from "./review-finding-card";
import type { ReviewFindingCardModel } from "@/lib/review/finding-card";

const card: ReviewFindingCardModel = {
  location: "§7 TM-02 · Acceptance Criteria",
  kicker: "Objectivity",
  title: "Subjective acceptance criterion",
  body: 'TM-02 passes if readings are "acceptable to the R&D Engineer".',
  suggestion: {
    kind: "replacement",
    deleteText: "acceptable to the R&D Engineer",
    insertText: "Measured force within ±5 g of the applied reference load",
  },
  primary: "apply",
  locate: {
    section: "measure",
    contentPath: "narrative",
    anchor: "acceptable to the R&D Engineer",
    needle: "acceptable to the R&D Engineer",
  },
};

function actionNames(): string[] {
  return screen.getAllByRole("button").map((button) => button.textContent ?? "");
}

describe("ReviewFindingCard", () => {
  it("highlights in the document and promotes the suggestion", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    const onPrimary = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ReviewFindingCard
        severity="critical"
        card={card}
        onShowInDocument={onShow}
        onPrimary={onPrimary}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("§7 TM-02 · Acceptance Criteria")).toBeInTheDocument();
    expect(screen.getByText("Objectivity")).toBeInTheDocument();
    expect(screen.getByText("Suggested replacement")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show in document" }));
    expect(onShow).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Apply as tracked change" }));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(onShow).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows in the document when the card itself is clicked", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <ReviewFindingCard severity="major" card={card} onShowInDocument={onShow} />
    );
    await user.click(screen.getByText("Subjective acceptance criterion"));
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("orders the actions the same way on a fixable card", () => {
    render(
      <ReviewFindingCard
        severity="major"
        card={card}
        onShowInDocument={vi.fn()}
        onPrimary={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(actionNames()).toEqual([
      "Apply as tracked change",
      "Show in document",
      "Dismiss",
    ]);
  });

  it("keeps the same buttons, disabled, when there is nothing to apply", () => {
    render(
      <ReviewFindingCard
        severity="major"
        card={{ ...card, suggestion: { kind: "none" }, primary: "none" }}
        onShowInDocument={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("Nothing to apply")).toBeInTheDocument();
    expect(actionNames()).toEqual([
      "Apply as tracked change",
      "Show in document",
      "Dismiss",
    ]);
    expect(
      screen.getByRole("button", { name: "Apply as tracked change" })
    ).toBeDisabled();
  });

  it("labels each suggestion kind in the same box", () => {
    const { rerender } = render(
      <ReviewFindingCard
        severity="minor"
        card={{ ...card, suggestion: { kind: "draft_on_apply", suggestedText: null } }}
      />
    );
    expect(screen.getByText("AI fix")).toBeInTheDocument();

    rerender(
      <ReviewFindingCard
        severity="minor"
        card={{ ...card, suggestion: { kind: "multi_part" }, primary: "view" }}
        onPrimary={vi.fn()}
      />
    );
    expect(screen.getByText("Suggested change")).toBeInTheDocument();
    expect(screen.getByText("In document")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View tracked change" })
    ).toBeInTheDocument();

    rerender(
      <ReviewFindingCard
        severity="minor"
        card={{
          ...card,
          suggestion: { kind: "draft_on_apply", suggestedText: "Prerequisites" },
        }}
      />
    );
    expect(screen.getByText("Suggested wording")).toBeInTheDocument();
    expect(screen.getByText("Prerequisites")).toBeInTheDocument();
    expect(
      screen.getByText("The AI places this in the document when you apply it.")
    ).toBeInTheDocument();
  });

  it("disables Show in document when there is no place to highlight", () => {
    render(<ReviewFindingCard severity="minor" card={{ ...card, locate: null }} />);
    expect(screen.getByRole("button", { name: "Show in document" })).toBeDisabled();
  });

  it("explains a fallback highlight only while the card is active", () => {
    const hint = "This finding is about the whole section, so the section is highlighted.";
    const { rerender } = render(
      <ReviewFindingCard severity="minor" card={card} locateHint={hint} />
    );
    expect(screen.queryByText(hint)).toBeNull();
    rerender(
      <ReviewFindingCard severity="minor" card={card} located locateHint={hint} />
    );
    expect(screen.getByText(hint)).toBeInTheDocument();
  });
});
