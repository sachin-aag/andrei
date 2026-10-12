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
  replacement: "Measured force within ±5 g of the applied reference load",
  locate: {
    section: "measure",
    contentPath: "narrative",
    needle: "acceptable to the R&D Engineer",
  },
  applyCommentId: "c1",
};

describe("ReviewFindingCard", () => {
  it("highlights in the document and promotes the suggestion", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    const onApply = vi.fn();
    render(
      <ReviewFindingCard
        severity="critical"
        card={card}
        onShowInDocument={onShow}
        onApplyTrackedChange={onApply}
      />
    );

    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("§7 TM-02 · Acceptance Criteria")).toBeInTheDocument();
    expect(screen.getByText("Objectivity")).toBeInTheDocument();
    expect(screen.getByText("Suggested replacement")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show in document" }));
    expect(onShow).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Apply as tracked change" }));
    expect(onApply).toHaveBeenCalledOnce();
  });
});
