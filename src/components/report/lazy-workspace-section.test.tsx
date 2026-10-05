// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LazyWorkspaceSection,
  requestWorkspaceSectionMount,
  resetLazyWorkspaceMountQueue,
} from "./lazy-workspace-section";

describe("LazyWorkspaceSection", () => {
  afterEach(() => {
    resetLazyWorkspaceMountQueue();
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
});
