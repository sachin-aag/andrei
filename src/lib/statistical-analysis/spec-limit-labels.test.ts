import { describe, expect, it } from "vitest";
import {
  estimateLabelWidth,
  layoutSpecLimitLabels,
  specLimitLabelText,
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

describe("specLimitLabelText", () => {
  it("pairs the spec name with a 2-decimal value", () => {
    expect(specLimitLabelText("lsl", 90)).toBe("LSL 90.00");
    expect(specLimitLabelText("usl", 110)).toBe("USL 110.00");
  });
});

describe("layoutSpecLimitLabels", () => {
  it("places LSL and USL in the top gutter on the inner face of each line", () => {
    const [lsl, usl] = layoutSpecLimitLabels(
      [
        { kind: "lsl", value: 90, lineX: 50 },
        { kind: "usl", value: 110, lineX: 290 },
      ],
      PLOT
    );

    expect(lsl?.text).toBe("LSL 90.00");
    expect(usl?.text).toBe("USL 110.00");
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
