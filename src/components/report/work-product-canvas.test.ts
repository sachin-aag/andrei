import { describe, expect, it } from "vitest";
import {
  attachmentIdFromTab,
  attachmentTabId,
  buildCanvasTabs,
  canvasTabKind,
  ensureAttachmentOpen,
  pruneOpenAttachments,
  removeAttachmentOpen,
  tabIdAfterClose,
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

  it("after close, activates the tab to the left, else Report", () => {
    const tabs = buildCanvasTabs({
      statsEnabled: true,
      openAttachmentIds: ["att-1", "att-2"],
      attachmentLabels: { "att-1": "a.pdf", "att-2": "b.pdf" },
      compare: { from: 1, to: 2 },
    });
    expect(
      tabIdAfterClose(tabs, "attachment:att-2", "attachment:att-2")
    ).toBe("attachment:att-1");
    expect(tabIdAfterClose(tabs, "history", "history")).toBe("attachment:att-2");
    expect(tabIdAfterClose(tabs, "attachment:att-1", "history")).toBe("history");
    expect(tabIdAfterClose(tabs, "report", "report")).toBe("report");
  });
});
