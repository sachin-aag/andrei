// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { LibraryAssetLabel } from "./library-asset-label";
import { render, screen } from "@testing-library/react";

describe("LibraryAssetLabel", () => {
  it("shows indexing copy while processing", () => {
    render(
      <LibraryAssetLabel
        filename="report.pdf"
        uploadedAt="2026-01-01T00:00:00.000Z"
        processingStatus="processing"
        processingProgress={42}
      />
    );
    expect(screen.getByText(/Indexing… 42%/)).toBeTruthy();
  });

  it("hides status suffix when ready", () => {
    render(
      <LibraryAssetLabel
        filename="report.pdf"
        uploadedAt="2026-01-01T00:00:00.000Z"
        processingStatus="ready"
      />
    );
    expect(screen.queryByText(/Indexing/)).toBeNull();
  });
});
