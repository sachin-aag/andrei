// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasTabPane } from "./canvas-tab-pane";
import {
  CanvasTabScrollProvider,
  readCanvasTabScrollTop,
  resetCanvasTabScrollStore,
  writeCanvasTabScrollTop,
} from "./canvas-tab-scroll";

describe("CanvasTabPane", () => {
  beforeEach(() => {
    resetCanvasTabScrollStore();
    const map = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCanvasTabScrollStore();
  });

  it("parks inactive panes with visibility instead of display:none", () => {
    const { rerender } = render(
      <CanvasTabPane active testId="pane">
        <span>Report body</span>
      </CanvasTabPane>
    );

    const pane = screen.getByTestId("pane");
    expect(pane).toHaveAttribute("data-canvas-pane", "active");
    expect(pane).not.toHaveAttribute("hidden");
    expect(pane).not.toHaveClass("hidden");
    expect(pane).not.toHaveClass("invisible");
    expect(screen.getByText("Report body")).toBeInTheDocument();

    rerender(
      <CanvasTabPane active={false} testId="pane">
        <span>Report body</span>
      </CanvasTabPane>
    );

    expect(pane).toHaveAttribute("data-canvas-pane", "parked");
    expect(pane).toHaveAttribute("aria-hidden", "true");
    expect(pane).toHaveClass("invisible");
    expect(pane).not.toHaveAttribute("hidden");
    expect(pane).not.toHaveClass("hidden");
    expect(screen.getByText("Report body")).toBeInTheDocument();
  });

  it("makes the pane the scroller when scrollable", () => {
    render(
      <CanvasTabPane active scrollable testId="pane">
        body
      </CanvasTabPane>
    );
    expect(screen.getByTestId("pane")).toHaveClass("overflow-auto");
  });

  it("keeps scrollTop when parked and shown again without remounting", () => {
    const { rerender } = render(
      <CanvasTabPane active scrollable testId="pane">
        <div style={{ height: 2000 }}>tall</div>
      </CanvasTabPane>
    );
    const pane = screen.getByTestId("pane");
    pane.scrollTop = 240;

    rerender(
      <CanvasTabPane active={false} scrollable testId="pane">
        <div style={{ height: 2000 }}>tall</div>
      </CanvasTabPane>
    );
    expect(pane.scrollTop).toBe(240);
    expect(pane).toHaveAttribute("data-canvas-pane", "parked");
    expect(pane).not.toHaveAttribute("hidden");
    expect(pane).not.toHaveClass("hidden");

    rerender(
      <CanvasTabPane active scrollable testId="pane">
        <div style={{ height: 2000 }}>tall</div>
      </CanvasTabPane>
    );
    expect(pane.scrollTop).toBe(240);
    expect(pane).toHaveAttribute("data-canvas-pane", "active");
  });

  it("restores a saved scroll offset on mount", () => {
    writeCanvasTabScrollTop("user-a", "report-a", "report", 360);
    render(
      <CanvasTabScrollProvider userId="user-a" reportId="report-a">
        <CanvasTabPane active scrollable scrollTabId="report" testId="pane">
          body
        </CanvasTabPane>
      </CanvasTabScrollProvider>
    );
    expect(screen.getByTestId("pane").scrollTop).toBe(360);
  });

  it("persists scrollTop when the pane is scrolled", async () => {
    render(
      <CanvasTabScrollProvider userId="user-a" reportId="report-a">
        <CanvasTabPane active scrollable scrollTabId="report" testId="pane">
          body
        </CanvasTabPane>
      </CanvasTabScrollProvider>
    );
    const pane = screen.getByTestId("pane");
    pane.scrollTop = 88;
    pane.dispatchEvent(new Event("scroll"));
    await waitFor(() => {
      expect(readCanvasTabScrollTop("user-a", "report-a", "report")).toBe(88);
    });
  });
});
