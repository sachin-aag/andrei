// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  busyBrowserTabLabel,
  busyBrowserTabTitle,
  useBusyBrowserTab,
  type BusyBrowserTabStatus,
} from "./use-busy-browser-tab";

function Probe({ status }: { status: BusyBrowserTabStatus | null }) {
  useBusyBrowserTab(status);
  return <div data-testid="busy-tab-probe">{status?.phase ?? "idle"}</div>;
}

describe("busyBrowserTabLabel", () => {
  it("names an in-flight upload", () => {
    expect(
      busyBrowserTabLabel({ phase: "uploading", current: 2, total: 54 })
    ).toBe("Uploading 2 of 54");
  });

  it("names a folder check with a known total", () => {
    expect(
      busyBrowserTabLabel({ phase: "checking", scanned: 12, total: 54 })
    ).toBe("Checking 12 of 54");
  });

  it("falls back when the folder size is still unknown", () => {
    expect(busyBrowserTabLabel({ phase: "checking" })).toBe("Checking folder");
    expect(busyBrowserTabLabel({ phase: "checking", scanned: 8 })).toBe(
      "Checking 8 files"
    );
  });
});

describe("busyBrowserTabTitle", () => {
  it("prefixes the original page title without nesting", () => {
    expect(
      busyBrowserTabTitle("Andrei", {
        phase: "uploading",
        current: 1,
        total: 1,
      })
    ).toBe("Uploading 1 of 1 — Andrei");
  });
});

describe("useBusyBrowserTab", () => {
  beforeEach(() => {
    document.title = "Andrei";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    document.title = "Andrei";
    vi.restoreAllMocks();
  });

  it("sets and restores the browser tab title across progress updates", () => {
    const { rerender, unmount } = render(
      <Probe status={{ phase: "checking", scanned: 1, total: 2 }} />
    );
    expect(screen.getByTestId("busy-tab-probe")).toHaveTextContent("checking");
    expect(document.title).toBe("Checking 1 of 2 — Andrei");

    rerender(
      <Probe status={{ phase: "uploading", current: 1, total: 2 }} />
    );
    expect(document.title).toBe("Uploading 1 of 2 — Andrei");

    rerender(
      <Probe status={{ phase: "uploading", current: 2, total: 2 }} />
    );
    expect(document.title).toBe("Uploading 2 of 2 — Andrei");

    rerender(<Probe status={null} />);
    expect(document.title).toBe("Andrei");

    unmount();
    expect(document.title).toBe("Andrei");
  });
});
