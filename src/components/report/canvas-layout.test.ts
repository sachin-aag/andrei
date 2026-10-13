import { describe, expect, it } from "vitest";
import {
  ANCHOR_PANE_ID,
  anchorPane,
  canSplitPane,
  closeOtherTabs,
  closeTab,
  createCanvasLayout,
  listPanes,
  openAttachmentOnPane,
  openTabOnPane,
  paneForReportJump,
  pruneCanvasLayout,
  selectTab,
  setSplitRatio,
  splitPane,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
} from "./canvas-layout";

function tabs(layout: ReturnType<typeof createCanvasLayout>, paneId: string) {
  const pane = listPanes(layout.root).find((item) => item.id === paneId);
  return pane?.tabIds ?? [];
}

describe("canvas layout", () => {
  it("pins report and analytics on the top-left pane", () => {
    const layout = createCanvasLayout(true);
    expect(anchorPane(layout.root).id).toBe(ANCHOR_PANE_ID);
    expect(anchorPane(layout.root).tabIds).toEqual(["report", "analytics"]);
    expect(canSplitPane(layout, ANCHOR_PANE_ID, "left", "report", true)).toBe(
      false
    );
    expect(canSplitPane(layout, ANCHOR_PANE_ID, "up", "analytics", true)).toBe(
      false
    );
    expect(canSplitPane(layout, ANCHOR_PANE_ID, "right", "report", true)).toBe(
      true
    );
  });

  it("copies a pinned report into a new pane and leaves it on the anchor", () => {
    const next = splitPane(
      createCanvasLayout(true),
      ANCHOR_PANE_ID,
      "right",
      "report",
      true
    );
    expect(tabs(next, ANCHOR_PANE_ID)).toEqual(["report", "analytics"]);
    expect(anchorPane(next.root).id).toBe(ANCHOR_PANE_ID);
    const copy = listPanes(next.root).find((pane) => pane.id !== ANCHOR_PANE_ID);
    expect(copy?.tabIds).toEqual(["report"]);
    expect(copy?.activeTabId).toBe("report");
    expect(next.focusedPaneId).toBe(copy?.id);
    expect(closeTab(next, copy!.id, "report", true).root.kind).toBe("pane");
  });

  it("moves an attachment into the new pane", () => {
    const opened = openAttachmentOnPane(
      createCanvasLayout(true),
      ANCHOR_PANE_ID,
      "att-1",
      true
    );
    const split = splitPane(opened, ANCHOR_PANE_ID, "down", "attachment:att-1", true);
    expect(tabs(split, ANCHOR_PANE_ID)).toEqual(["report", "analytics"]);
    const lower = listPanes(split.root).find((pane) => pane.id !== ANCHOR_PANE_ID);
    expect(lower?.tabIds).toEqual(["attachment:att-1"]);
    expect(canSplitPane(split, lower!.id, "right", "attachment:att-1", true)).toBe(
      false
    );
  });

  it("opens the same pdf on the focused pane without stealing the other copy", () => {
    const right = splitPane(
      openAttachmentOnPane(createCanvasLayout(false), ANCHOR_PANE_ID, "att-1", false),
      ANCHOR_PANE_ID,
      "right",
      "attachment:att-1",
      false
    );
    const again = openAttachmentOnPane(right, ANCHOR_PANE_ID, "att-1", false);
    expect(tabs(again, ANCHOR_PANE_ID)).toContain("attachment:att-1");
    const side = listPanes(again.root).find((pane) => pane.id !== ANCHOR_PANE_ID);
    expect(side?.tabIds).toEqual(["attachment:att-1"]);
    expect(again.focusedPaneId).toBe(ANCHOR_PANE_ID);
  });

  it("stops at a 2 by 2 grid", () => {
    let layout = createCanvasLayout(true);
    layout = splitPane(layout, ANCHOR_PANE_ID, "right", "report", true);
    const rightId = layout.focusedPaneId;
    layout = openTabOnPane(layout, rightId, "analytics", true);
    layout = splitPane(layout, ANCHOR_PANE_ID, "down", "analytics", true);
    layout = splitPane(layout, rightId, "down", "analytics", true);
    expect(listPanes(layout.root)).toHaveLength(4);
    for (const pane of listPanes(layout.root)) {
      expect(canSplitPane(layout, pane.id, "right", pane.activeTabId, true)).toBe(
        false
      );
      expect(canSplitPane(layout, pane.id, "down", pane.activeTabId, true)).toBe(
        false
      );
    }
  });

  it("lets a lower pane split left while the anchor stays top-left", () => {
    const layout = splitPane(
      createCanvasLayout(true),
      ANCHOR_PANE_ID,
      "down",
      "report",
      true
    );
    const lower = layout.focusedPaneId;
    expect(canSplitPane(layout, lower, "left", "report", true)).toBe(false);
    const withFile = openAttachmentOnPane(layout, lower, "att-9", true);
    expect(canSplitPane(withFile, lower, "left", "attachment:att-9", true)).toBe(
      true
    );
    const split = splitPane(withFile, lower, "left", "attachment:att-9", true);
    expect(anchorPane(split.root).id).toBe(ANCHOR_PANE_ID);
    expect(tabs(split, ANCHOR_PANE_ID)).toEqual(["report", "analytics"]);
    expect(listPanes(split.root)).toHaveLength(3);
  });

  it("close others on the anchor keeps the pins and the chosen tab", () => {
    const opened = openAttachmentOnPane(
      openAttachmentOnPane(createCanvasLayout(true), ANCHOR_PANE_ID, "a", true),
      ANCHOR_PANE_ID,
      "b",
      true
    );
    const closed = closeOtherTabs(opened, ANCHOR_PANE_ID, "attachment:b", true);
    expect(tabs(closed, ANCHOR_PANE_ID)).toEqual([
      "report",
      "analytics",
      "attachment:b",
    ]);
    expect(closeTab(closed, ANCHOR_PANE_ID, "report", true)).toBe(closed);
  });

  it("keeps a single compare tab and restores the anchor for section jumps", () => {
    const layout = openAttachmentOnPane(
      createCanvasLayout(false),
      ANCHOR_PANE_ID,
      "att-1",
      false
    );
    const split = splitPane(layout, ANCHOR_PANE_ID, "right", "attachment:att-1", false);
    const side = split.focusedPaneId;
    const compared = openTabOnPane(split, side, "history", false);
    expect(
      listPanes(compared.root).filter((pane) => pane.tabIds.includes("history"))
    ).toHaveLength(1);
    const moved = openTabOnPane(compared, ANCHOR_PANE_ID, "history", false);
    expect(tabs(moved, ANCHOR_PANE_ID)).toContain("history");
    expect(tabs(moved, side)).not.toContain("history");
    const viewingFile = selectTab(moved, side, "attachment:att-1");
    expect(paneForReportJump(viewingFile).id).toBe(ANCHOR_PANE_ID);
    const onReport = selectTab(
      openTabOnPane(viewingFile, side, "report", false),
      side,
      "report"
    );
    expect(paneForReportJump(onReport).id).toBe(side);
  });

  it("keeps the same layout object when nothing is stale", () => {
    const layout = createCanvasLayout(true);
    expect(
      pruneCanvasLayout(layout, {
        statsEnabled: true,
        liveAttachmentIds: new Set(),
        historyOpen: false,
      })
    ).toBe(layout);
  });

  it("drops closed files and empty panes", () => {
    const layout = splitPane(
      openAttachmentOnPane(createCanvasLayout(false), ANCHOR_PANE_ID, "att-1", false),
      ANCHOR_PANE_ID,
      "right",
      "attachment:att-1",
      false
    );
    const pruned = pruneCanvasLayout(layout, {
      statsEnabled: false,
      liveAttachmentIds: new Set(),
      historyOpen: false,
    });
    expect(pruned.root.kind).toBe("pane");
    expect(tabs(pruned, ANCHOR_PANE_ID)).toEqual(["report"]);
  });

  it("clamps the split ratio", () => {
    const layout = splitPane(
      createCanvasLayout(false),
      ANCHOR_PANE_ID,
      "right",
      "report",
      false
    );
    const split = layout.root;
    expect(split.kind).toBe("split");
    if (split.kind !== "split") return;
    expect(setSplitRatio(layout, split.id, 0.01).root).toMatchObject({
      ratio: SPLIT_RATIO_MIN,
    });
    expect(setSplitRatio(layout, split.id, 0.99).root).toMatchObject({
      ratio: SPLIT_RATIO_MAX,
    });
  });
});
