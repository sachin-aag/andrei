// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWorkspaceLoading } from "@/components/report/report-workspace-loading";

describe("ReportWorkspaceLoading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with Loading report… and notes a slow load after 12s", () => {
    vi.useFakeTimers();
    render(<ReportWorkspaceLoading />);
    expect(screen.getByText("Loading report…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(
      screen.getByText("Still loading — a large report can take a bit…")
    ).toBeInTheDocument();
  });
});
