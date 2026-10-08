import { describe, expect, it } from "vitest";
import {
  DRAWING_DEFAULT_COLOR,
  drawingEquals,
  drawingExtent,
  drawingHasOverflow,
  drawingLabelTexts,
  drawingPreviewSummary,
  editorWorkspaceExtent,
  emptyImageDrawing,
  flattenPixelPad,
  isEmptyImageDrawing,
  layoutCallouts,
  layoutCalloutsLeft,
  parseDrawingOperation,
  parseImageDrawing,
  type DrawingLabel,
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

  it("keeps overflow coordinates and drops junk", () => {
    const drawing = parseImageDrawing({
      shapes: [
        { type: "arrow", x1: -0.4, y1: 1.2, x2: 0.5, y2: 0.5 },
        { type: "nope" },
        { type: "label", x: -0.25, y: 0.2, w: 0, h: -1, text: "S-2" },
        { type: "arrow", x1: -9, y1: 12, x2: 0.5, y2: 0.5 },
      ],
    });
    expect(drawing?.shapes[0]).toMatchObject({ x1: -0.4, y1: 1.2, x2: 0.5, y2: 0.5 });
    expect(drawing?.shapes[1]).toMatchObject({ type: "label", text: "S-2", w: 0.16, x: -0.25 });
    expect(drawing?.shapes[2]).toMatchObject({ x1: -2, y1: 3 });
  });

  it("treats empty and null as empty", () => {
    expect(isEmptyImageDrawing(null)).toBe(true);
    expect(isEmptyImageDrawing(emptyImageDrawing())).toBe(true);
    expect(parseImageDrawing("not-json")).toBeNull();
  });
});

function labelsOf(drawing: ReturnType<typeof layoutCallouts>): DrawingLabel[] {
  return drawing.shapes.filter((shape): shape is DrawingLabel => shape.type === "label");
}

function labelFullyOutside(label: DrawingLabel): boolean {
  return (
    label.x + label.w <= 0 ||
    label.x >= 1 ||
    label.y + label.h <= 0 ||
    label.y >= 1
  );
}

function labelsOverlap(a: DrawingLabel, b: DrawingLabel): boolean {
  const pad = 0.01;
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

describe("layoutCallouts", () => {
  it("stacks labels outside the left of the photo when tips are omitted", () => {
    const drawing = layoutCalloutsLeft([
      { text: "S-1" },
      { text: "S-9a to S-9d\n(3.9 meter level)" },
      { text: "  " },
    ]);
    const labels = labelsOf(drawing);
    const arrows = drawing.shapes.filter((shape) => shape.type === "arrow");
    expect(labels).toHaveLength(2);
    expect(arrows).toHaveLength(2);
    expect(labels[0]?.text).toBe("S-1");
    expect(labels.every((label) => label.x + label.w <= 0)).toBe(true);
    expect(arrows[0]?.x1).toBeLessThan(0);
    expect(arrows[0]?.x2).toBeGreaterThan(arrows[0]!.x1);
    expect(drawingHasOverflow(drawing)).toBe(true);
  });

  it("keeps every AI label fully outside the photo", () => {
    const drawing = layoutCallouts([
      { text: "S-1", tipX: 0.18, tipY: 0.22 },
      { text: "S-2", tipX: 0.82, tipY: 0.28 },
      { text: "S-3", tipX: 0.5, tipY: 0.06 },
      { text: "S-4", tipX: 0.48, tipY: 0.94 },
      { text: "S-5" },
    ]);
    const labels = labelsOf(drawing);
    expect(labels).toHaveLength(5);
    expect(labels.every(labelFullyOutside)).toBe(true);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(labelsOverlap(labels[i]!, labels[j]!)).toBe(false);
      }
    }
  });

  it("hugs the nearest outer edge so arrows stay short", () => {
    const right = layoutCallouts([{ text: "S-2", tipX: 0.88, tipY: 0.4 }]);
    const rightLabel = labelsOf(right)[0];
    expect(rightLabel?.x).toBeGreaterThanOrEqual(1);
    const top = layoutCallouts([{ text: "Top dish", tipX: 0.5, tipY: 0.05 }]);
    const topLabel = labelsOf(top)[0];
    expect((topLabel?.y ?? 0) + (topLabel?.h ?? 0)).toBeLessThanOrEqual(0);
    const bottom = layoutCallouts([{ text: "Base", tipX: 0.5, tipY: 0.96 }]);
    expect(labelsOf(bottom)[0]?.y).toBeGreaterThanOrEqual(1);
  });

  it("spreads two close tips on the same side so labels do not overlap", () => {
    const drawing = layoutCallouts([
      { text: "S-1", tipX: 0.2, tipY: 0.5 },
      { text: "S-2", tipX: 0.22, tipY: 0.52 },
    ]);
    const labels = labelsOf(drawing);
    expect(labels).toHaveLength(2);
    expect(labels.every((label) => label.x + label.w <= 0)).toBe(true);
    expect(labelsOverlap(labels[0]!, labels[1]!)).toBe(false);
  });

  it("expands the saved extent so outside labels stay visible", () => {
    const drawing = layoutCalloutsLeft([{ text: "S-1" }]);
    const extent = drawingExtent(drawing);
    expect(extent.minX).toBeLessThan(0);
    expect(extent.maxX).toBeGreaterThanOrEqual(1);
    const pad = flattenPixelPad(extent, 100, 80);
    expect(pad.left).toBeGreaterThan(0);
    expect(editorWorkspaceExtent(drawing).minX).toBeLessThanOrEqual(extent.minX);
  });

  it("gives the annotate dialog a drawable margin around an empty figure", () => {
    const extent = editorWorkspaceExtent(emptyImageDrawing());
    expect(extent.minX).toBeLessThan(0);
    expect(extent.maxX).toBeGreaterThan(1);
    expect(extent.minY).toBeLessThan(0);
    expect(extent.maxY).toBeGreaterThan(1);
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
