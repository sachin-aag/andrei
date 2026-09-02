import { describe, expect, it } from "vitest";
import { computeHistogramFromValues } from "./histogram";
import { HISTOGRAM } from "./types";
import { renderHistogramPng } from "./render-histogram-png";

describe("renderHistogramPng", () => {
  it("draws intermediate axis tick labels", () => {
    const outcome = computeHistogramFromValues(
      [10, 12, 11, 13, 14, 12, 11, 9, 15, 70],
      0,
      {
        columnId: "c1",
        columnName: "Measurement",
        title: "Histogram of Measurement",
        lsl: 14,
        usl: null,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);

    const texts: string[] = [];
    const result = renderHistogramPng(
      {
        id: "an-1",
        workspaceId: "ws-1",
        kind: HISTOGRAM,
        title: "Histogram of Measurement",
        config: {
          columnId: "c1",
          columnName: "Measurement",
          title: "Histogram of Measurement",
          lsl: 14,
          usl: null,
        },
        results: outcome.result,
        sourceHash: "abc",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
      {
        loadCanvas: () => ({
          createCanvas: () => ({
            getContext: () =>
              ({
                fillStyle: "",
                strokeStyle: "",
                globalAlpha: 1,
                lineWidth: 1,
                font: "",
                textAlign: "left",
                textBaseline: "top",
                setLineDash: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                stroke: () => {},
                fill: () => {},
                fillRect: () => {},
                strokeRect: () => {},
                fillText: (text: string) => {
                  texts.push(text);
                },
                save: () => {},
                restore: () => {},
                translate: () => {},
                rotate: () => {},
              }) as never,
            toBuffer: () => Buffer.from("png"),
          }),
        }),
      }
    );
    expect(result).toBeInstanceOf(Buffer);
    expect(texts).toContain("Measurement");
    expect(texts).toContain("Frequency");
    expect(texts).toContain("-50");
    expect(texts).toContain("0");
    expect(texts).toContain("50");
    expect(texts).toContain("100");
    expect(texts).not.toContain("-14.52");
  });
});
