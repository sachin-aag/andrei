// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveStatus } from "@/components/report/save-status";

describe("SaveStatus", () => {
  it("renders the saving state", () => {
    render(<SaveStatus status="saving" lastSavedAt={null} />);

    expect(screen.getByText(/Saving/)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(<SaveStatus status="error" lastSavedAt={null} />);

    expect(screen.getByText("Save error")).toBeInTheDocument();
  });

  it("renders the saved state with a timestamp", () => {
    render(<SaveStatus status="saved" lastSavedAt={new Date("2026-05-01T10:30:00")} />);

    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });

  it("renders the idle state as up to date", () => {
    render(<SaveStatus status="idle" lastSavedAt={null} />);

    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });
});
