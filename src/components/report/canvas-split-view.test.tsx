// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ANCHOR_PANE_ID,
  createCanvasLayout,
  splitPane,
} from "./canvas-layout";
import { CANVAS_TAB_DRAG_MIME } from "./canvas-tab-drag";
import { CanvasSplitView } from "./canvas-split-view";

function renderSplit(presentation: "grid" | "single" = "grid") {
  const layout = splitPane(
    createCanvasLayout(true),
    ANCHOR_PANE_ID,
    "right",
    "analytics",
    true
  );
  const onSplit = vi.fn();
  const onMoveTab = vi.fn();
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
      onMoveTab={onMoveTab}
      onRatio={vi.fn()}
      renderBody={(pane) => <div>body {pane.id}</div>}
    />
  );
  return { layout, onSplit, onMoveTab };
}

describe("CanvasSplitView", () => {
  it("keeps the anchor analytics pinned and lets the copy close", () => {
    renderSplit();
    expect(screen.getByTestId("canvas-pane-anchor")).toBeInTheDocument();
    expect(screen.getByTestId("report-surface-analytics")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close Analytics" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Close Analytics" })
    ).toHaveLength(1);
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

  it("offers split directions from the analytics tab menu", async () => {
    const user = userEvent.setup();
    const { onSplit } = renderSplit("grid");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByTestId("report-surface-analytics"),
    });
    expect(await screen.findByRole("menuitem", { name: "Split right" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    const splitDown = await screen.findByRole("menuitem", { name: "Split down" });
    expect(splitDown).not.toHaveAttribute("data-disabled");
    await user.click(splitDown);
    expect(onSplit).toHaveBeenCalledWith(ANCHOR_PANE_ID, "down", "analytics");
  });

  it("does not offer splitting the live report", async () => {
    const user = userEvent.setup();
    renderSplit("grid");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByTestId("report-surface-document"),
    });
    expect(await screen.findByRole("menuitem", { name: "Split right" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: "Split down" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("drags a tab from one pane onto the other", () => {
    const { onMoveTab } = renderSplit();
    const store = new Map<string, string>();
    const dataTransfer = {
      setData(type: string, value: string) {
        store.set(type, value);
      },
      getData(type: string) {
        return store.get(type) ?? "";
      },
      get types() {
        return [...store.keys()];
      },
      effectAllowed: "move",
      dropEffect: "move",
    };
    fireEvent.dragStart(screen.getByTestId("pane-1-report-surface-analytics"), {
      dataTransfer,
    });
    expect(store.has(CANVAS_TAB_DRAG_MIME)).toBe(true);
    const anchor = screen.getByTestId("canvas-pane-anchor");
    fireEvent.dragOver(anchor, { dataTransfer });
    fireEvent.drop(anchor, { dataTransfer });
    expect(onMoveTab).toHaveBeenCalledWith("pane-1", ANCHOR_PANE_ID, "analytics");
  });

  it("does not offer tab dragging in the single-pane presentation", () => {
    renderSplit("single");
    expect(screen.getByTestId("report-surface-document")).not.toHaveAttribute(
      "draggable",
      "true"
    );
  });
});
