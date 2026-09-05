import { describe, expect, it } from "vitest";
import {
  buildOutlineSpanRows,
  mergeVisualPresenceFlags,
  visualPresenceFlags,
} from "./page-metadata";

describe("visualPresenceFlags", () => {
  it("stores null when the page was never classified", () => {
    expect(visualPresenceFlags({ classified: false, tables: ["x"] })).toEqual({
      hasTable: null,
      hasFigure: null,
    });
  });

  it("stores false when insight ran and noted no tables or figures", () => {
    expect(
      visualPresenceFlags({ classified: true, tables: [], figures: [] })
    ).toEqual({ hasTable: false, hasFigure: false });
  });

  it("stores true when insight named a table or figure", () => {
    expect(
      visualPresenceFlags({
        classified: true,
        tables: ["FMEA grid"],
        figures: [],
      })
    ).toEqual({ hasTable: true, hasFigure: false });
  });
});

describe("mergeVisualPresenceFlags", () => {
  it("ORs classified parts and stays null when every tile is unclassified", () => {
    expect(
      mergeVisualPresenceFlags([
        { hasTable: null, hasFigure: null },
        { hasTable: null, hasFigure: null },
      ])
    ).toEqual({ hasTable: null, hasFigure: null });
    expect(
      mergeVisualPresenceFlags([
        { hasTable: false, hasFigure: null },
        { hasTable: true, hasFigure: false },
      ])
    ).toEqual({ hasTable: true, hasFigure: false });
  });
});

describe("buildOutlineSpanRows", () => {
  it("groups adjacent headings and unions page identifiers", () => {
    const rows = buildOutlineSpanRows([
      {
        pageNumber: 31,
        pageContext: null,
        transcript:
          "TABLE 4 SOFTWARE REQUIREMENTS\nSW-LWB-4 Laser wavelength bandwidth Pass",
        identifiers: ["SW-LWB-4"],
      },
      {
        pageNumber: 32,
        pageContext: null,
        transcript: "TABLE 4 SOFTWARE REQUIREMENTS\nSW-LCB-1 Laser control board Pass",
        identifiers: ["SW-LCB-1"],
      },
    ]);
    expect(rows).toEqual([
      {
        ordinal: 0,
        title: "TABLE 4 SOFTWARE REQUIREMENTS",
        pageStart: 31,
        pageEnd: 32,
        identifiers: ["SW-LWB-4", "SW-LCB-1"],
      },
    ]);
  });
});
