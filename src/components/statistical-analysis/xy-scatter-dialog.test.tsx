// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import { XyScatterDialog } from "./xy-scatter-dialog";

const worksheet = createEmptyWorksheet(2);

function renderDialog(
  overrides: Partial<ComponentProps<typeof XyScatterDialog>> = {}
) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <XyScatterDialog
      open
      worksheet={worksheet}
      defaultYColumnId="c1"
      submitting={false}
      error={null}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

describe("XyScatterDialog Advanced", () => {
  it("keeps the description short and explains Legend on hover", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.getByText("Plot a numeric Y against X or observation index.")
    ).toBeTruthy();
    expect(screen.getByTestId("xy-legend-info")).toBeInTheDocument();

    await user.hover(screen.getByTestId("xy-legend-info"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /colors dots, lines, or stacked columns/i
    );
  });

  it("keeps Advanced collapsed until the summary is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();

    const advanced = screen.getByTestId("xy-advanced");
    expect(advanced).not.toHaveAttribute("open");
    expect(screen.getByTestId("xy-xmin")).toBeInTheDocument();

    await user.click(screen.getByText("Advanced"));
    expect(advanced).toHaveAttribute("open");
    expect(screen.getByLabelText("Min X")).toBeTruthy();
    expect(screen.getByLabelText("Max X")).toBeTruthy();
    expect(screen.getByLabelText("Min Y")).toBeTruthy();
    expect(screen.getByLabelText("Max Y")).toBeTruthy();
    expect(screen.getByLabelText("X axis title")).toBeTruthy();
    expect(screen.getByLabelText("Y axis title")).toBeTruthy();
  });

  it("submits axis window and titles from Advanced", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByText("Advanced"));
    await user.type(screen.getByTestId("xy-xmin"), "0");
    await user.type(screen.getByTestId("xy-xmax"), "10");
    await user.type(screen.getByTestId("xy-ymin"), "5");
    await user.type(screen.getByTestId("xy-ymax"), "40");
    await user.type(screen.getByTestId("xy-x-label"), "Time (h)");
    await user.type(screen.getByTestId("xy-y-label"), "Assay (%)");
    await user.click(screen.getByTestId("xy-scatter-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        yColumnId: "c1",
        xMin: 0,
        xMax: 10,
        yMin: 5,
        yMax: 40,
        xAxisLabel: "Time (h)",
        yAxisLabel: "Assay (%)",
      })
    );
  });

  it("sends null axis limits when Advanced fields are left blank", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByTestId("xy-scatter-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null,
        xAxisLabel: null,
        yAxisLabel: null,
        showMeanLine: false,
        showSpecLimits: false,
      })
    );
  });

  it("disables OK when min X is not less than max X", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("Advanced"));
    await user.type(screen.getByTestId("xy-xmin"), "10");
    await user.type(screen.getByTestId("xy-xmax"), "1");

    expect(screen.getByTestId("xy-scatter-ok")).toBeDisabled();
  });

  it("submits Show mean line when checked", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByTestId("xy-show-mean-line"));
    await user.click(screen.getByTestId("xy-scatter-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ showMeanLine: true })
    );
  });
});
