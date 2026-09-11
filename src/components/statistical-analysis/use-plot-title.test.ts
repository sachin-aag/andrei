// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePlotTitle } from "./use-plot-title";

describe("usePlotTitle", () => {
  it("prefills the suggested title for new plots", () => {
    const { result } = renderHook(() => usePlotTitle("Assay by Lot"));

    expect(result.current.title).toBe("Assay by Lot");
    expect(result.current.resolvedTitle).toBe("Assay by Lot");
  });

  it("keeps an explicit default title in edit mode", () => {
    const { result } = renderHook(() =>
      usePlotTitle("Assay by Lot", "Custom title")
    );

    expect(result.current.title).toBe("Custom title");
    expect(result.current.resolvedTitle).toBe("Custom title");
  });

  it("updates the title when the suggestion changes until the user edits", () => {
    const { result, rerender } = renderHook(
      ({ suggested }) => usePlotTitle(suggested),
      { initialProps: { suggested: "Assay by Lot" } }
    );

    rerender({ suggested: "Assay by Batch" });
    expect(result.current.title).toBe("Assay by Batch");

    act(() => {
      result.current.setTitle("Q1 Assay by Lot");
    });
    rerender({ suggested: "Assay by Batch" });
    expect(result.current.title).toBe("Q1 Assay by Lot");
  });

  it("falls back to the suggestion when the field is cleared", () => {
    const { result } = renderHook(() => usePlotTitle("Assay by Lot"));

    act(() => {
      result.current.setTitle("   ");
    });

    expect(result.current.resolvedTitle).toBe("Assay by Lot");
  });
});
