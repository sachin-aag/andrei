import { describe, expect, it } from "vitest";
import {
  attachmentIdFromTab,
  attachmentTabId,
  buildCanvasTabs,
  canvasTabKind,
  ensureAttachmentOpen,
  pruneOpenAttachments,
  CANVAS_TAB_RECENTS_CAP,
  rememberCanvasTabVisit,
  removeAttachmentOpen,
  tabIdAfterClosing,
} from "./work-product-canvas";

describe("work-product-canvas", () => {
  it("round-trips attachment tab ids", () => {
    expect(attachmentTabId("att-1")).toBe("attachment:att-1");
    expect(attachmentIdFromTab("attachment:att-1")).toBe("att-1");
    expect(attachmentIdFromTab("report")).toBeNull();
    expect(canvasTabKind("attachment:att-1")).toBe("attachment");
    expect(canvasTabKind("history")).toBe("history");
  });

  it("does not duplicate an already-open attachment", () => {
    expect(ensureAttachmentOpen(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(ensureAttachmentOpen(["a"], "b")).toEqual(["a", "b"]);
  });

  it("drops closed and deleted attachments", () => {
    expect(removeAttachmentOpen(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(pruneOpenAttachments(["a", "gone", "b"], new Set(["a", "b"]))).toEqual(
      ["a", "b"]
    );
  });

  it("builds pinned tabs without close and extra tabs with close", () => {
    const tabs = buildCanvasTabs({
      statsEnabled: true,
      openAttachmentIds: ["att-1"],
      attachmentLabels: { "att-1": "batch.pdf" },
      compare: { from: 1, to: 2 },
    });
    expect(tabs.map((tab) => tab.id)).toEqual([
      "report",
      "analytics",
      "attachment:att-1",
      "history",
    ]);
    expect(tabs.filter((tab) => !tab.closable).map((tab) => tab.label)).toEqual([
      "Report",
      "Analytics",
    ]);
    expect(tabs.find((tab) => tab.id === "attachment:att-1")).toMatchObject({
      label: "batch.pdf",
      closable: true,
      closeAriaLabel: "Close batch.pdf",
    });
    expect(tabs.find((tab) => tab.id === "history")).toMatchObject({
      label: "Compare 1 → 2",
      closeAriaLabel: "Close compare",
    });
  });

  it("omits Analytics when stats are off", () => {
    const tabs = buildCanvasTabs({
      statsEnabled: false,
      openAttachmentIds: [],
      attachmentLabels: {},
      compare: null,
    });
    expect(tabs.map((tab) => tab.id)).toEqual(["report"]);
  });

  it("records canvas tab visits with the most recent last", () => {
    expect(rememberCanvasTabVisit(["report"], "analytics")).toEqual([
      "report",
      "analytics",
    ]);
    expect(
      rememberCanvasTabVisit(["report", "analytics"], "report")
    ).toEqual(["analytics", "report"]);
    const many = rememberCanvasTabVisit(
      [
        "report",
        "analytics",
        "attachment:a",
        "attachment:b",
        "attachment:c",
        "attachment:d",
        "attachment:e",
        "history",
      ],
      "attachment:f"
    );
    expect(many).toHaveLength(CANVAS_TAB_RECENTS_CAP);
    expect(many.at(-1)).toBe("attachment:f");
    expect(many[0]).not.toBe("report");
  });

  it("after closing the active tab, restores the last visited remaining tab", () => {
    const remaining = [
      "report",
      "analytics",
      "attachment:att-1",
      "history",
    ] as const;
    expect(
      tabIdAfterClosing({
        closedId: "attachment:att-2",
        currentlyActive: "attachment:att-2",
        recents: ["report", "attachment:att-1", "attachment:att-2"],
        remainingTabIds: remaining,
      })
    ).toBe("attachment:att-1");
    expect(
      tabIdAfterClosing({
        closedId: "attachment:att-1",
        currentlyActive: "attachment:att-1",
        recents: ["report", "analytics", "attachment:att-1"],
        remainingTabIds: ["report", "analytics"],
      })
    ).toBe("analytics");
    expect(
      tabIdAfterClosing({
        closedId: "attachment:att-1",
        currentlyActive: "attachment:att-1",
        recents: ["report", "attachment:att-1"],
        remainingTabIds: ["report", "analytics"],
      })
    ).toBe("report");
    expect(
      tabIdAfterClosing({
        closedId: "attachment:att-1",
        currentlyActive: "history",
        recents: ["report", "attachment:att-1", "history"],
        remainingTabIds: remaining,
      })
    ).toBe("history");
    expect(
      tabIdAfterClosing({
        closedId: "attachment:att-1",
        currentlyActive: "attachment:att-1",
        recents: ["attachment:att-1"],
        remainingTabIds: ["report"],
      })
    ).toBe("report");
  });
});
