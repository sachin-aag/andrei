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
    expect(screen.getByText(/one box of every numeric Y/i)).toBeTruthy();
    await user.click(screen.getByTestId("boxplot-ok"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        yColumnId: "c1",
        categoryColumnIds: [],
        title: "",
        rowStart: null,
        rowEnd: null,
      })
    );
  });

  it("adds and removes nested category columns", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByTestId("boxplot-add-category"));
    expect(screen.getByTestId("boxplot-category-0")).toBeInTheDocument();
    expect(screen.getByText("Category (innermost)")).toBeTruthy();

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
