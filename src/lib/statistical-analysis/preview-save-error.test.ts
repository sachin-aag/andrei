import { describe, expect, it } from "vitest";
import { isPermanentPreviewSaveError } from "./client";

describe("isPermanentPreviewSaveError", () => {
  function withStatus(status: number): Error & { status?: number } {
    const error: Error & { status?: number } = new Error("nope");
    error.status = status;
    return error;
  }

  it("treats a 400 as permanent", () => {
    // The unsupported-kind 400 retried on every re-render, rasterizing the
    // plot each time. That is the loop this stops.
    expect(isPermanentPreviewSaveError(withStatus(400))).toBe(true);
  });

  it("treats 404 as permanent", () => {
    expect(isPermanentPreviewSaveError(withStatus(404))).toBe(true);
  });

  it("does not treat a server error as permanent", () => {
    expect(isPermanentPreviewSaveError(withStatus(500))).toBe(false);
    expect(isPermanentPreviewSaveError(withStatus(503))).toBe(false);
  });

  it("does not treat a network failure as permanent", () => {
    // No status at all — a dropped connection should still retry.
    expect(isPermanentPreviewSaveError(new Error("Failed to fetch"))).toBe(false);
    expect(isPermanentPreviewSaveError(null)).toBe(false);
    expect(isPermanentPreviewSaveError(undefined)).toBe(false);
  });
});
