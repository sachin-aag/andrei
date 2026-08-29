// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalysisRecomputeButton } from "./analysis-recompute-button";

describe("AnalysisRecomputeButton", () => {
  it("calls onClick and shows a spinning icon while recomputing", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <AnalysisRecomputeButton onClick={onClick} recomputing={false} />
    );

    await user.click(screen.getByTestId("recompute-analysis"));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<AnalysisRecomputeButton onClick={onClick} recomputing />);
    expect(screen.getByTestId("recompute-analysis")).toBeDisabled();
    expect(screen.getByTestId("recompute-analysis")).toHaveAttribute(
      "aria-label",
      "Recomputing…"
    );
  });
});
