// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ANCHOR_PANE_ID,
  createCanvasLayout,
  splitPane,
} from "./canvas-layout";
import { CanvasSplitView } from "./canvas-split-view";

function renderSplit(presentation: "grid" | "single" = "grid") {
  const layout = splitPane(
    createCanvasLayout(true),
    ANCHOR_PANE_ID,
    "right",
    "report",
    true
  );
  const onSplit = vi.fn();
  render(
    <CanvasSplitView
      layout={layout}
      presentation={presentation}
      statsEnabled
      attachmentLabels={{}}
      compare={null}
      onFocusPane={vi.fn()}
      onSelectTab={vi.fn()}
      onCloseTab={vi.fn()}
      onCloseOthers={vi.fn()}
      onSplit={onSplit}
      onDropAttachment={vi.fn()}
      onRatio={vi.fn()}
      renderBody={(pane) => <div>body {pane.id}</div>}
    />
  );
  return { layout, onSplit };
}

describe("CanvasSplitView", () => {
  it("keeps the anchor report pinned and lets the copy close", () => {
    renderSplit();
    expect(screen.getByTestId("canvas-pane-anchor")).toBeInTheDocument();
    expect(screen.getByTestId("report-surface-document")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close Report" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close Report" })).toHaveLength(
      1
    );
  });

  it("hides the split menu in the single-pane presentation", async () => {
    const user = userEvent.setup();
    renderSplit("single");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByTestId("report-surface-document"),
    });
    expect(screen.queryByRole("menuitem", { name: "Split right" })).toBeNull();
  });

  it("offers split directions from the document tab menu", async () => {
    const user = userEvent.setup();
    const { onSplit } = renderSplit("grid");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByTestId("report-surface-document"),
    });
    expect(await screen.findByRole("menuitem", { name: "Split right" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    const splitDown = await screen.findByRole("menuitem", { name: "Split down" });
    expect(splitDown).not.toHaveAttribute("data-disabled");
    await user.click(splitDown);
    expect(onSplit).toHaveBeenCalledWith(ANCHOR_PANE_ID, "down", "report");
  });
});
