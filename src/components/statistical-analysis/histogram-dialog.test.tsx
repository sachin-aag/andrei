// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyWorksheet, upsertSpecRow } from "@/lib/statistical-analysis/worksheet";
import { HistogramDialog } from "./histogram-dialog";

const worksheet = createEmptyWorksheet(3);

function renderDialog(
  overrides: Partial<ComponentProps<typeof HistogramDialog>> = {}
) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <HistogramDialog
      open
      worksheet={worksheet}
      defaultColumnId="c1"
      submitting={false}
      error={null}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

describe("HistogramDialog", () => {
  it("submits overlay checkboxes on by default", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    expect(screen.getByTestId("histogram-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("histogram-show-distribution")).toBeChecked();
    expect(screen.getByTestId("histogram-show-lsl")).toBeChecked();
    expect(screen.getByTestId("histogram-show-usl")).toBeChecked();
    await user.click(screen.getByTestId("histogram-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        columnId: "c1",
        lsl: null,
        usl: null,
        showDistributionLines: true,
        showLsl: true,
        showUsl: true,
        rowStart: null,
        rowEnd: null,
      })
    );
  });

  it("prefills LSL/USL from column specs only", async () => {
    const user = userEvent.setup();
    const worksheetWithSpecs = upsertSpecRow(createEmptyWorksheet(3), {
      columnName: "C1",
      lsl: "90",
      usl: "110",
      target: "100",
    });
    const { onSubmit } = renderDialog({ worksheet: worksheetWithSpecs });

    expect(screen.getByTestId("histogram-lsl")).toHaveValue("90");
    expect(screen.getByTestId("histogram-usl")).toHaveValue("110");
    await user.click(screen.getByTestId("histogram-ok"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ lsl: 90, usl: 110 })
    );
  });

  it("unchecks overlay lines independently", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();


    await user.click(screen.getByTestId("histogram-show-distribution"));
    await user.click(screen.getByTestId("histogram-show-lsl"));
    await user.click(screen.getByTestId("histogram-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        showDistributionLines: false,
        showLsl: false,
        showUsl: true,
      })
    );
  });
});
