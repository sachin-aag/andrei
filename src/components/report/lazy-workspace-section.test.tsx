// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LazyWorkspaceSection,
  notifyWorkspaceScroll,
  requestWorkspaceSectionMount,
  resetLazyWorkspaceMountQueue,
  warmupAllLazyWorkspaceSections,
} from "./lazy-workspace-section";

describe("LazyWorkspaceSection", () => {
  afterEach(() => {
    resetLazyWorkspaceMountQueue();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("defers eager sections until the first animation frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });

    render(
      <LazyWorkspaceSection id="elr_objective" title="Objective" eager>
        <p>Objective body</p>
      </LazyWorkspaceSection>
    );
    expect(screen.queryByText("Objective body")).not.toBeInTheDocument();

    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Objective body")).toBeInTheDocument();
  });

  it("holds lazy sections until they intersect", () => {
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <LazyWorkspaceSection id="elr_alarms" title="Alarms">
        <p>Alarms body</p>
      </LazyWorkspaceSection>
    );
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^alarms$/i })).toBeInTheDocument();
    expect(document.getElementById("elr_alarms")).toHaveAttribute(
      "id",
      "elr_alarms"
    );
  });

  it("mounts intersecting sections one frame at a time", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("requestIdleCallback", undefined);

    const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> =
      [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          cb: (entries: Array<{ isIntersecting: boolean }>) => void
        ) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      }
    );

    render(
      <>
        <LazyWorkspaceSection id="qsr_rtm_process" title="Process">
          <p>Process body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="qsr_rtm_control" title="Control">
          <p>Control body</p>
        </LazyWorkspaceSection>
      </>
    );

    act(() => {
      for (const notify of observers) {
        notify([{ isIntersecting: true }]);
      }
    });
    expect(screen.queryByText("Process body")).not.toBeInTheDocument();
    expect(screen.queryByText("Control body")).not.toBeInTheDocument();

    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Process body")).toBeInTheDocument();
    expect(screen.queryByText("Control body")).not.toBeInTheDocument();

    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.queryByText("Control body")).not.toBeInTheDocument();

    act(() => {
      warmupAllLazyWorkspaceSections();
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Control body")).toBeInTheDocument();
  });

  it("mounts a requested section ahead of the viewport queue", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <>
        <LazyWorkspaceSection id="qsr_rtm_process" title="Process">
          <p>Process body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="qsr_rtm_control" title="Control">
          <p>Control body</p>
        </LazyWorkspaceSection>
      </>
    );

    act(() => {
      requestWorkspaceSectionMount("qsr_rtm_control");
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Control body")).toBeInTheDocument();
    expect(screen.queryByText("Process body")).not.toBeInTheDocument();
  });

  it("warms remaining sections on idle so Contents can jump anywhere", () => {
    const frames: FrameRequestCallback[] = [];
    const idles: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal(
      "requestIdleCallback",
      (cb: () => void) => {
        idles.push(cb);
        return idles.length;
      }
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <>
        <LazyWorkspaceSection id="elr_objective" title="Objective" eager>
          <p>Objective body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_scope" title="Scope">
          <p>Scope body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_alarms" title="Alarms">
          <p>Alarms body</p>
        </LazyWorkspaceSection>
      </>
    );

    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Objective body")).toBeInTheDocument();
    expect(screen.queryByText("Scope body")).not.toBeInTheDocument();

    act(() => {
      warmupAllLazyWorkspaceSections();
    });
    expect(screen.queryByText("Scope body")).not.toBeInTheDocument();
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();

    act(() => {
      idles.shift()?.();
    });
    expect(screen.getByText("Scope body")).toBeInTheDocument();
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();

    act(() => {
      idles.shift()?.();
    });
    expect(screen.getByText("Alarms body")).toBeInTheDocument();
  });

  it("does not mount every stub that packed into the viewport on a Contents jump", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("requestIdleCallback", undefined);

    const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> =
      [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          cb: (entries: Array<{ isIntersecting: boolean }>) => void
        ) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      }
    );

    render(
      <>
        <LazyWorkspaceSection id="elr_scope" title="Scope">
          <p>Scope body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_description" title="Description">
          <p>Description body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_alarms" title="Alarms">
          <p>Alarms body</p>
        </LazyWorkspaceSection>
      </>
    );

    act(() => {
      for (const notify of observers) {
        notify([{ isIntersecting: true }]);
      }
      requestWorkspaceSectionMount("elr_alarms");
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Alarms body")).toBeInTheDocument();
    expect(screen.queryByText("Scope body")).not.toBeInTheDocument();
    expect(screen.queryByText("Description body")).not.toBeInTheDocument();
  });

  it("skips a prefetch that has scrolled out of view", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("innerHeight", 800);

    const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> =
      [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          cb: (entries: Array<{ isIntersecting: boolean }>) => void
        ) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      }
    );

    const rect = {
      x: 0,
      y: 4000,
      top: 4000,
      bottom: 4128,
      left: 0,
      right: 0,
      width: 0,
      height: 128,
      toJSON() {
        return this;
      },
    } satisfies DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect
    );

    render(
      <LazyWorkspaceSection id="elr_alarms" title="Alarms">
        <p>Alarms body</p>
      </LazyWorkspaceSection>
    );

    act(() => {
      observers[0]?.([{ isIntersecting: true }]);
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^alarms$/i })).toBeInTheDocument();
  });

  it("lets a Contents jump skip ahead of the warmup queue", () => {
    const frames: FrameRequestCallback[] = [];
    const idles: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal(
      "requestIdleCallback",
      (cb: () => void) => {
        idles.push(cb);
        return idles.length;
      }
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <>
        <LazyWorkspaceSection id="elr_objective" title="Objective" eager>
          <p>Objective body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_scope" title="Scope">
          <p>Scope body</p>
        </LazyWorkspaceSection>
        <LazyWorkspaceSection id="elr_alarms" title="Alarms">
          <p>Alarms body</p>
        </LazyWorkspaceSection>
      </>
    );

    act(() => {
      frames.shift()?.(0);
      warmupAllLazyWorkspaceSections();
      requestWorkspaceSectionMount("elr_alarms");
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Alarms body")).toBeInTheDocument();
    expect(screen.queryByText("Scope body")).not.toBeInTheDocument();
  });

  it("holds a Contents jump until the target editor is mounted", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <LazyWorkspaceSection id="elr_alarms" title="Alarms">
        <p>Alarms body</p>
      </LazyWorkspaceSection>
    );

    let ready = false;
    let pending: Promise<void> | undefined;
    act(() => {
      pending = requestWorkspaceSectionMount("elr_alarms").then(() => {
        ready = true;
      });
    });
    expect(ready).toBe(false);
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();

    act(() => {
      frames.shift()?.(0);
    });
    await act(async () => {
      await pending;
    });
    expect(ready).toBe(true);
    expect(screen.getByText("Alarms body")).toBeInTheDocument();
  });

  it("does not wait when the Contents target is already mounted", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });

    render(
      <LazyWorkspaceSection id="elr_objective" title="Objective" eager>
        <p>Objective body</p>
      </LazyWorkspaceSection>
    );
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Objective body")).toBeInTheDocument();

    let ready = false;
    await act(async () => {
      await requestWorkspaceSectionMount("elr_objective").then(() => {
        ready = true;
      });
    });
    expect(ready).toBe(true);
  });

  it("does not start another editor while the document is scrolling", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("requestIdleCallback", undefined);
    class DeferredObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", DeferredObserver);

    render(
      <LazyWorkspaceSection id="elr_alarms" title="Alarms">
        <p>Alarms body</p>
      </LazyWorkspaceSection>
    );

    act(() => {
      notifyWorkspaceScroll();
      warmupAllLazyWorkspaceSections();
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      frames.shift()?.(0);
    });
    expect(screen.getByText("Alarms body")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
