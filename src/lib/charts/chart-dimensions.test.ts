import { describe, expect, it } from "vitest";
import {
  DOCUMENT_INSERTED_PLOT_MAX_HEIGHT_PX,
  DOCUMENT_INSERTED_PLOT_MAX_WIDTH_PX,
  documentInsertedPlotWidth,
} from "./chart-dimensions";

describe("documentInsertedPlotWidth", () => {
  it("caps a tall scatter so narrative height stays bounded", () => {
    const width = documentInsertedPlotWidth({ widthPx: 600, heightPx: 450 });
    const displayedHeight = Math.round((width * 450) / 600);
    expect(width).toBeLessThanOrEqual(DOCUMENT_INSERTED_PLOT_MAX_WIDTH_PX);
    expect(displayedHeight).toBeLessThanOrEqual(DOCUMENT_INSERTED_PLOT_MAX_HEIGHT_PX);
  });

  it("shrinks a 600×400 preview to a 300px-tall document figure", () => {
    const width = documentInsertedPlotWidth({ widthPx: 600, heightPx: 400 });
    expect(width).toBe(450);
    expect(Math.round((width * 400) / 600)).toBe(DOCUMENT_INSERTED_PLOT_MAX_HEIGHT_PX);
  });

  it("caps a wide sixpack preview by width", () => {
    const width = documentInsertedPlotWidth({ widthPx: 1100, heightPx: 622 });
    expect(width).toBe(DOCUMENT_INSERTED_PLOT_MAX_WIDTH_PX);
  });
});
