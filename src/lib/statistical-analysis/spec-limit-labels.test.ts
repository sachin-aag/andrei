import { describe, expect, it } from "vitest";
import {
  estimateLabelWidth,
  layoutControlLimitLabels,
  layoutSpecLimitLabels,
} from "./spec-limit-labels";

const PLOT = { left: 36, right: 308, top: 12, bottom: 168 };

function leftEdge(layout: {
  x: number;
  text: string;
  textAnchor: "start" | "middle" | "end";
}): number {
  const width = estimateLabelWidth(layout.text);
  if (layout.textAnchor === "start") return layout.x;
  if (layout.textAnchor === "end") return layout.x - width;
  return layout.x - width / 2;
}

function rightEdge(layout: {
  x: number;
  text: string;
  textAnchor: "start" | "middle" | "end";
}): number {
  return leftEdge(layout) + estimateLabelWidth(layout.text);
}

describe("layoutSpecLimitLabels", () => {
  it("places numeric LSL and USL labels in the top gutter on the inner face", () => {
    const [lsl, usl] = layoutSpecLimitLabels(
      [
        { kind: "lsl", value: 90, lineX: 50 },
        { kind: "usl", value: 110, lineX: 290 },
      ],
      PLOT
    );

    expect(lsl?.text).toBe("90.00");
    expect(usl?.text).toBe("110.00");
    expect(lsl?.y).toBe(PLOT.top - 3);
    expect(usl?.y).toBe(PLOT.top - 3);
    expect(lsl?.textAnchor).toBe("start");
    expect(lsl?.x).toBeGreaterThan(50);
    expect(usl?.textAnchor).toBe("end");
    expect(usl?.x).toBeLessThan(290);
  });

  it("keeps labels inside the plot horizontally", () => {
    const labels = layoutSpecLimitLabels(
      [
        { kind: "lsl", value: 90, lineX: PLOT.left },
        { kind: "usl", value: 110, lineX: PLOT.right },
      ],
      PLOT
    );

    for (const label of labels) {
      expect(leftEdge(label)).toBeGreaterThanOrEqual(PLOT.left);
      expect(rightEdge(label)).toBeLessThanOrEqual(PLOT.right);
    }
  });

  it("moves USL below the plot when the two labels would overlap", () => {
    const [lsl, usl] = layoutSpecLimitLabels(
      [
        { kind: "lsl", value: 99.5, lineX: 160 },
        { kind: "usl", value: 100.5, lineX: 168 },
      ],
      PLOT
    );

    expect(lsl?.y).toBe(PLOT.top - 3);
    expect(usl?.y).toBe(PLOT.bottom - 8);
    expect(usl?.y).toBeLessThan(PLOT.bottom);
  });

  it("flips a label to the outer face when the inner face would clip", () => {
    const [lsl] = layoutSpecLimitLabels(
      [{ kind: "lsl", value: 110, lineX: PLOT.right - 2 }],
      PLOT
    );

    expect(lsl?.textAnchor).toBe("end");
    expect(rightEdge(lsl!)).toBeLessThanOrEqual(PLOT.right);
  });

  it("ignores non-finite coordinates", () => {
    expect(
      layoutSpecLimitLabels(
        [{ kind: "lsl", value: 90, lineX: Number.NaN }],
        PLOT
      )
    ).toEqual([]);
  });
});

describe("layoutControlLimitLabels", () => {
  it("places numeric UCL above and LCL below their lines on the right edge", () => {
    const [ucl, lcl] = layoutControlLimitLabels(
      [
        { kind: "ucl", value: 111.15, lineY: 28 },
        { kind: "lcl", value: 93.73, lineY: 150 },
      ],
      PLOT
    );

    expect(ucl?.text).toBe("111.15");
    expect(lcl?.text).toBe("93.73");
    expect(ucl?.textAnchor).toBe("end");
    expect(lcl?.textAnchor).toBe("end");
    expect(ucl?.x).toBe(PLOT.right - 3);
    expect(ucl?.y).toBeLessThan(28);
    expect(lcl?.y).toBeGreaterThan(150);
  });

  it("keeps labels off the y-axis and above the x-axis numbers", () => {
    const labels = layoutControlLimitLabels(
      [
        { kind: "ucl", value: 10, lineY: PLOT.top },
        { kind: "lcl", value: 0, lineY: PLOT.bottom },
      ],
      PLOT
    );

    for (const label of labels) {
      expect(label.x).toBeGreaterThan((PLOT.left + PLOT.right) / 2);
      expect(label.y).toBeGreaterThanOrEqual(PLOT.top - 3);
      expect(label.y).toBeLessThan(PLOT.bottom);
    }
  });

  it("separates UCL and LCL when the two lines are almost on top of each other", () => {
    const [ucl, lcl] = layoutControlLimitLabels(
      [
        { kind: "ucl", value: 1.1, lineY: 90 },
        { kind: "lcl", value: 0.9, lineY: 92 },
      ],
      PLOT
    );

    expect(ucl && lcl).toBeTruthy();
    expect(Math.abs((ucl?.y ?? 0) - (lcl?.y ?? 0))).toBeGreaterThanOrEqual(10);
  });

  it("ignores non-finite coordinates", () => {
    expect(
      layoutControlLimitLabels(
        [{ kind: "ucl", value: 10, lineY: Number.NaN }],
        PLOT
      )
    ).toEqual([]);
  });
});
