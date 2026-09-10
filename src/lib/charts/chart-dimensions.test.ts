import { describe, expect, it } from "vitest";
import {
  CHART_DISPLAY_WIDTH_PX,
  documentInsertedPlotWidth,
} from "./chart-dimensions";

describe("documentInsertedPlotWidth", () => {
  it("keeps a 600px scatter at the document display width", () => {
    expect(documentInsertedPlotWidth({ widthPx: 600, heightPx: 450 })).toBe(
      CHART_DISPLAY_WIDTH_PX
    );
    expect(documentInsertedPlotWidth({ widthPx: 600, heightPx: 400 })).toBe(
      CHART_DISPLAY_WIDTH_PX
    );
  });

  it("caps a wide sixpack preview at the DOCX display width, not a smaller box", () => {
    expect(documentInsertedPlotWidth({ widthPx: 1100, heightPx: 622 })).toBe(
      CHART_DISPLAY_WIDTH_PX
    );
  });

  it("does not shrink a tall sixpack capture to the old 300px-height floor", () => {
    const width = documentInsertedPlotWidth({ widthPx: 600, heightPx: 720 });
    expect(width).toBe(CHART_DISPLAY_WIDTH_PX);
    expect(Math.round((width * 720) / 600)).toBe(720);
  });
});
