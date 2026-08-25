import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import {
  CHART_DISPLAY_WIDTH_PX,
  CHART_LOGICAL_HEIGHT,
  CHART_LOGICAL_WIDTH,
  renderChartPng,
} from "@/lib/charts/render-chart";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";

describe("renderChartPng", () => {
  it("returns canvas_unavailable when the canvas loader fails", async () => {
    const result = await renderChartPng(TORQUE_MOCK_SPEC, {
      loadCanvas: () => null,
    });
    expect(result).toEqual({ error: "canvas_unavailable" });
  });

  it("renders a 2× PNG that is a valid suggestion src", async () => {
    const result = await renderChartPng(TORQUE_MOCK_SPEC, { packId: "demo" });
    if ("error" in result) {
      expect(result.error).toBe("canvas_unavailable");
      return;
    }
    expect(isValidSuggestionImageSrc(result.dataUrl)).toBe(true);
    expect(result.widthPx).toBe(CHART_DISPLAY_WIDTH_PX);
    expect(result.rasterWidthPx).toBe(CHART_LOGICAL_WIDTH * 2);
    expect(result.rasterHeightPx).toBe(CHART_LOGICAL_HEIGHT * 2);
  });
});
