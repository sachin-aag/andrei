// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { WORKSHEET_PLOT_CATALOG } from "@/lib/statistical-analysis/plot-catalog";
import { HISTOGRAM } from "@/lib/statistical-analysis/types";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import { AnalyzeDialog } from "./analyze-dialog";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe("AnalyzeDialog", () => {
  it("lists every worksheet plot and hands off kinds that have a dedicated dialog", async () => {
    const user = userEvent.setup();
    const onHandoff = vi.fn();
    render(
      <AnalyzeDialog
        open
        worksheet={createEmptyWorksheet()}
        defaultColumnId="c1"
        submitting={false}
        error={null}
        onOpenChange={vi.fn()}
        onHandoff={onHandoff}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("analyze-plot-type"));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(
      WORKSHEET_PLOT_CATALOG.map((item) => item.label)
    );

    await user.click(screen.getByRole("option", { name: "Histogram" }));
    expect(onHandoff).toHaveBeenCalledWith(HISTOGRAM);
  });
});
