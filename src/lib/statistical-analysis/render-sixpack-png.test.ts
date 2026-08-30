import { describe, expect, it } from "vitest";
import { SAMPLE_ASSAY_VALUES } from "./sample-data";
import {
  renderSixpackPng,
  SIXPACK_PNG_HEIGHT,
  SIXPACK_PNG_WIDTH,
} from "./render-sixpack-png";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { CAPABILITY_SIXPACK_NORMAL } from "./types";

describe("renderSixpackPng", () => {
  it("returns canvas_unavailable when the canvas loader fails", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [...SAMPLE_ASSAY_VALUES],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay",
        lsl: 90,
        usl: 110,
        target: 100,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);
    const result = renderSixpackPng(
      {
        id: "an-1",
        workspaceId: "ws-1",
        kind: CAPABILITY_SIXPACK_NORMAL,
        title: "Assay",
        config: {
          columnId: "c1",
          columnName: "Assay",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
        },
        results: outcome.result,
        sourceHash: "abc",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
      { loadCanvas: () => null }
    );
    expect(result).toEqual({ error: "canvas_unavailable" });
  });

  it("draws panel titles, axis labels, and capability stats", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [...SAMPLE_ASSAY_VALUES],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay",
        lsl: 90,
        usl: 110,
        target: 100,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);

    const texts: string[] = [];
    const result = renderSixpackPng(
      {
        id: "an-1",
        workspaceId: "ws-1",
        kind: CAPABILITY_SIXPACK_NORMAL,
        title: "Assay",
        config: {
          columnId: "c1",
          columnName: "Assay",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
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
                closePath: () => {},
                arc: () => {},
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
    expect(texts).toContain("Process Capability Sixpack of Assay");
    expect(texts).toContain("I Chart");
    expect(texts).toContain("Last 25 Observations");
    expect(texts).toContain("Capability Histogram");
    expect(texts).toContain("Moving Range Chart");
    expect(texts).toContain("Normal Probability Plot");
    expect(texts).toContain("Process Capability");
    expect(texts).toContain("PROCESS DATA");
    expect(texts).toContain("Sample N");
    expect(texts).toContain("Cpk");
    expect(texts).toContain("90.00");
    expect(texts).toContain("110.00");
    expect(texts).toContain("Observation");
    expect(texts).toContain("Individual");
    expect(texts).toContain("Moving range");
  });

  it("renders a labeled PNG with the native canvas", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [...SAMPLE_ASSAY_VALUES],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay",
        lsl: 90,
        usl: 110,
        target: 100,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);
    const result = renderSixpackPng(
      {
        id: "an-1",
        workspaceId: "ws-1",
        kind: CAPABILITY_SIXPACK_NORMAL,
        title: "Assay",
        config: {
          columnId: "c1",
          columnName: "Assay",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
        },
        results: outcome.result,
        sourceHash: "abc",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
      { packId: "demo" }
    );
    if ("error" in result) {
      expect(result.error).toBe("canvas_unavailable");
      return;
    }
    expect(result.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(result.length).toBeGreaterThan(20_000);
    expect(SIXPACK_PNG_WIDTH).toBeGreaterThan(1000);
    expect(SIXPACK_PNG_HEIGHT).toBeGreaterThan(700);
  });
});
