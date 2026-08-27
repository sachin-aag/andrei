import { describe, expect, it } from "vitest";
import {
  contentUrlFromPreviewSrc,
  layoutPreviewTextSpan,
  layoutPreviewTextSpans,
  pdfPreviewRenderScale,
  PDF_PREVIEW_HORIZONTAL_PADDING,
  PDF_PREVIEW_SCALE,
} from "@/lib/attachments/pdf-preview-layout";

describe("contentUrlFromPreviewSrc", () => {
  it("strips the fragment and page hint so one URL covers every page", () => {
    expect(
      contentUrlFromPreviewSrc(
        "/api/reports/r1/attachments/a1/content?proxy=1&page=2#page=2"
      )
    ).toBe("/api/reports/r1/attachments/a1/content?proxy=1");
  });
});

describe("layoutPreviewTextSpan", () => {
  it("converts PDF bottom-left coordinates to CSS top-left at preview scale", () => {
    const span = layoutPreviewTextSpan(
      {
        str: "Batch 123",
        transform: [12, 0, 0, 12, 10, 380],
        width: 80,
        height: 12,
        fontName: "F1",
        dir: "ltr",
        hasEOL: true,
      },
      { F1: { fontFamily: "Times", ascent: 0.8 } },
      400,
      PDF_PREVIEW_SCALE
    );

    expect(span).toMatchObject({
      str: "Batch 123",
      left: 15,
      width: 80 * PDF_PREVIEW_SCALE,
      height: 12 * PDF_PREVIEW_SCALE,
      fontSize: 12 * PDF_PREVIEW_SCALE,
      fontFamily: "Times",
      dir: "ltr",
      hasEOL: true,
    });
    expect(span?.top).toBeCloseTo(
      (400 - 380) * PDF_PREVIEW_SCALE - 0.8 * 12 * PDF_PREVIEW_SCALE,
      5
    );
  });

  it("skips empty strings and drops malformed transforms", () => {
    expect(
      layoutPreviewTextSpans(
        [
          { str: "", transform: [1, 0, 0, 1, 0, 0], width: 1, height: 1 },
          { str: "ok", transform: [1, 0], width: 1, height: 1 },
          { str: "kept", transform: [10, 0, 0, 10, 0, 10], width: 20, height: 10 },
        ],
        {},
        100,
        1
      ).map((span) => span.str)
    ).toEqual(["kept"]);
  });
});

describe("pdfPreviewRenderScale", () => {
  it("fits the page to the preview viewport at 100% zoom", () => {
    const pageWidthAtBaseScale = 200 * PDF_PREVIEW_SCALE;
    const viewportWidth = 400;
    const scale = pdfPreviewRenderScale({
      viewportWidth,
      pageWidthAtBaseScale,
      zoomLevel: 1,
    });
    const renderedWidth = 200 * scale;
    expect(renderedWidth).toBe(viewportWidth - PDF_PREVIEW_HORIZONTAL_PADDING);
  });

  it("scales beyond fit-to-width when zooming in", () => {
    const pageWidthAtBaseScale = 200 * PDF_PREVIEW_SCALE;
    const viewportWidth = 400;
    const at100 = pdfPreviewRenderScale({
      viewportWidth,
      pageWidthAtBaseScale,
      zoomLevel: 1,
    });
    const at125 = pdfPreviewRenderScale({
      viewportWidth,
      pageWidthAtBaseScale,
      zoomLevel: 1.25,
    });
    expect(at125).toBeGreaterThan(at100);
    expect(200 * at125).toBeCloseTo(
      (viewportWidth - PDF_PREVIEW_HORIZONTAL_PADDING) * 1.25,
      5
    );
  });
});
