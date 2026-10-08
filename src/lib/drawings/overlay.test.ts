import { describe, expect, it } from "vitest";
import {
  DRAWING_DEFAULT_COLOR,
  drawingEquals,
  drawingLabelTexts,
  drawingPreviewSummary,
  emptyImageDrawing,
  isEmptyImageDrawing,
  layoutCalloutsLeft,
  parseDrawingOperation,
  parseImageDrawing,
} from "@/lib/drawings/overlay";

describe("parseImageDrawing", () => {
  it("round-trips arrows and labels", () => {
    const drawing = parseImageDrawing({
      version: 1,
      shapes: [
        {
          id: "a1",
          type: "arrow",
          x1: 0.1,
          y1: 0.2,
          x2: 0.8,
          y2: 0.4,
          color: DRAWING_DEFAULT_COLOR,
        },
        {
          id: "l1",
          type: "label",
          x: 0.05,
          y: 0.1,
          w: 0.2,
          h: 0.08,
          text: "S-1",
          color: DRAWING_DEFAULT_COLOR,
        },
      ],
    });
    expect(drawing?.shapes).toHaveLength(2);
    expect(drawingLabelTexts(drawing)).toEqual(["S-1"]);
    expect(parseImageDrawing(JSON.stringify(drawing))).toEqual(drawing);
  });

  it("clamps coordinates and drops junk", () => {
    const drawing = parseImageDrawing({
      shapes: [
        { type: "arrow", x1: -2, y1: 3, x2: 0.5, y2: 0.5 },
        { type: "nope" },
        { type: "label", x: 0.2, y: 0.2, w: 0, h: -1, text: "S-2" },
      ],
    });
    expect(drawing?.shapes[0]).toMatchObject({ x1: 0, y1: 1, x2: 0.5, y2: 0.5 });
    expect(drawing?.shapes[1]).toMatchObject({ type: "label", text: "S-2", w: 0.16 });
  });

  it("treats empty and null as empty", () => {
    expect(isEmptyImageDrawing(null)).toBe(true);
    expect(isEmptyImageDrawing(emptyImageDrawing())).toBe(true);
    expect(parseImageDrawing("not-json")).toBeNull();
  });
});

describe("layoutCalloutsLeft", () => {
  it("stacks labels on the left and arrows into the figure", () => {
    const drawing = layoutCalloutsLeft([
      { text: "S-1" },
      { text: "S-9a to S-9d\n(3.9 meter level)" },
      { text: "  " },
    ]);
    const labels = drawing.shapes.filter((shape) => shape.type === "label");
    const arrows = drawing.shapes.filter((shape) => shape.type === "arrow");
    expect(labels).toHaveLength(2);
    expect(arrows).toHaveLength(2);
    expect(labels[0]?.text).toBe("S-1");
    expect(labels[0]?.x).toBeLessThan(0.1);
    expect(arrows[0]?.x2).toBeGreaterThan(arrows[0]!.x1);
  });

  it("uses an explicit tip when provided", () => {
    const drawing = layoutCalloutsLeft([{ text: "S-4", tipX: 0.7, tipY: 0.25 }]);
    const arrow = drawing.shapes.find((shape) => shape.type === "arrow");
    expect(arrow).toMatchObject({ x2: 0.7, y2: 0.25 });
  });

  it("summarizes labels for the suggestion card", () => {
    expect(drawingPreviewSummary(emptyImageDrawing())).toBe("Clear figure annotations");
    expect(drawingPreviewSummary(layoutCalloutsLeft([{ text: "S-1" }, { text: "S-2" }]))).toBe(
      "Annotate: S-1, S-2"
    );
  });
});

describe("parseDrawingOperation", () => {
  it("requires a 1-based index and parsed drawing", () => {
    expect(parseDrawingOperation({ index: 0, drawing: emptyImageDrawing() })).toBeUndefined();
    expect(parseDrawingOperation({ index: 1, drawing: { shapes: [] } })).toEqual({
      index: 1,
      drawing: { version: 1, shapes: [] },
    });
  });

  it("compares drawings structurally", () => {
    const a = layoutCalloutsLeft([{ text: "S-1" }]);
    expect(drawingEquals(a, parseImageDrawing(JSON.stringify(a)))).toBe(true);
    expect(drawingEquals(a, emptyImageDrawing())).toBe(false);
  });
});
