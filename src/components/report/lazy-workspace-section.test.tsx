// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyWorkspaceSection } from "./lazy-workspace-section";

describe("LazyWorkspaceSection", () => {
  it("renders eager sections immediately", () => {
    render(
      <LazyWorkspaceSection id="elr_objective" eager>
        <p>Objective body</p>
      </LazyWorkspaceSection>
    );
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
      <LazyWorkspaceSection id="elr_alarms">
        <p>Alarms body</p>
      </LazyWorkspaceSection>
    );
    expect(screen.queryByText("Alarms body")).not.toBeInTheDocument();
    expect(document.getElementById("elr_alarms")).toHaveAttribute(
      "id",
      "elr_alarms"
    );

    vi.unstubAllGlobals();
  });
});
