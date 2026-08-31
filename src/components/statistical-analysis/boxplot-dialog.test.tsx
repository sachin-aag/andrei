// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import { BoxplotDialog } from "./boxplot-dialog";

const worksheet = createEmptyWorksheet(3);

function renderDialog(
  overrides: Partial<ComponentProps<typeof BoxplotDialog>> = {}
) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <BoxplotDialog
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

describe("BoxplotDialog", () => {
  it("submits numeric Y with no categories", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    expect(screen.getByTestId("boxplot-dialog")).toBeInTheDocument();
    expect(screen.getByText("Tukey box-and-whisker of a numeric Y.")).toBeTruthy();
    expect(screen.getByText("One box of all Y.")).toBeTruthy();
    expect(screen.getByTestId("boxplot-categories-info")).toBeInTheDocument();
    await user.click(screen.getByTestId("boxplot-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        yColumnId: "c1",
        categoryColumnIds: [],
        title: "",
        rowStart: null,
        rowEnd: null,
        xAxisLabel: null,
        yAxisLabel: null,
      })
    );
  });

  it("exposes axis title fields in Advanced", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    expect(screen.getByTestId("boxplot-advanced")).toBeInTheDocument();
    await user.click(screen.getByText("Advanced"));
    expect(screen.getByLabelText("X axis title")).toBeInTheDocument();
    expect(screen.getByLabelText("Y axis title")).toBeInTheDocument();

    await user.type(screen.getByTestId("boxplot-x-label"), "Factor");
    await user.type(screen.getByTestId("boxplot-y-label"), "Assay (%)");
    await user.click(screen.getByTestId("boxplot-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxisLabel: "Factor",
        yAxisLabel: "Assay (%)",
      })
    );
  });

  it("adds and removes nested category columns", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByTestId("boxplot-add-category"));
    expect(screen.getByTestId("boxplot-category-0")).toBeInTheDocument();
    expect(screen.getByText("Category (innermost)")).toBeTruthy();

    await user.hover(screen.getByTestId("boxplot-categories-info"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /first category is closest to the boxes/i
    );

    await user.click(screen.getByTestId("boxplot-add-category"));
    expect(screen.getByTestId("boxplot-category-1")).toBeInTheDocument();
    expect(screen.getByText("Category 2 (outermost)")).toBeTruthy();

    await user.click(screen.getByTestId("boxplot-remove-category-1"));
    expect(screen.queryByTestId("boxplot-category-1")).toBeNull();

    await user.click(screen.getByTestId("boxplot-ok"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        yColumnId: "c1",
        categoryColumnIds: ["c2"],
      })
    );
  });

  it("prefills categories when editing", () => {
    renderDialog({
      editMode: true,
      defaultCategoryColumnIds: ["c2", "c3"],
      defaultTitle: "Boxplot of Assay by Operator, Batch",
    });
    expect(screen.getByTestId("boxplot-category-0")).toBeInTheDocument();
    expect(screen.getByTestId("boxplot-category-1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Boxplot of Assay by Operator, Batch")).toBeTruthy();
    expect(screen.getByTestId("boxplot-ok")).toHaveTextContent("Update");
  });
});
