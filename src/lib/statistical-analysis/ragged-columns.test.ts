import { describe, expect, it } from "vitest";
import { raggedColumns, raggedColumnsNote } from "./ragged-columns";

describe("raggedColumns", () => {
  it("catches the lyophilizer dump where only the date columns fell short", () => {
    // The shape that shipped: TT/VAC filled, DATE/TIME got two rows, and the
    // write reported the first column's height as if all were complete.
    const ragged = raggedColumns([
      { columnName: "TT1", rowsWritten: 2142 },
      { columnName: "VAC1", rowsWritten: 2142 },
      { columnName: "DATE", rowsWritten: 2 },
      { columnName: "TIME", rowsWritten: 2 },
    ]);
    expect(ragged).toEqual([
      { columnName: "DATE", rowsWritten: 2, expectedRows: 2142 },
      { columnName: "TIME", rowsWritten: 2, expectedRows: 2142 },
    ]);
  });

  it("passes an evenly filled table", () => {
    expect(
      raggedColumns([
        { columnName: "DATE", rowsWritten: 2142 },
        { columnName: "TT1", rowsWritten: 2142 },
      ])
    ).toEqual([]);
  });

  it("tolerates a few trailing blanks", () => {
    // A notes or label column that stops short of the data is normal; a false
    // refusal costs more than a missed near-miss.
    expect(
      raggedColumns([
        { columnName: "TT1", rowsWritten: 2142 },
        { columnName: "Remark", rowsWritten: 2100 },
      ])
    ).toEqual([]);
  });

  it("ignores a fully empty column", () => {
    // Writing no values is a different intent — clearing, or a placeholder.
    expect(
      raggedColumns([
        { columnName: "TT1", rowsWritten: 2142 },
        { columnName: "Spare", rowsWritten: 0 },
      ])
    ).toEqual([]);
  });

  it("does not judge a table too small for a ratio to mean anything", () => {
    expect(
      raggedColumns([
        { columnName: "Step", rowsWritten: 6 },
        { columnName: "Note", rowsWritten: 1 },
      ])
    ).toEqual([]);
  });

  it("does not judge a single-column write", () => {
    expect(raggedColumns([{ columnName: "Assay", rowsWritten: 40 }])).toEqual([]);
  });

  it("names an unnamed column rather than printing null", () => {
    const ragged = raggedColumns([
      { columnName: "TT1", rowsWritten: 100 },
      { columnName: null, rowsWritten: 3 },
    ]);
    expect(ragged[0]?.columnName).toBe("(unnamed)");
  });
});

describe("raggedColumnsNote", () => {
  it("tells the model to rewrite rather than analyse or report done", () => {
    const note = raggedColumnsNote([
      { columnName: "DATE", rowsWritten: 2, expectedRows: 2142 },
    ]);
    expect(note).toContain("INCOMPLETE");
    expect(note).toContain("DATE got 2 of 2142");
    expect(note).toContain("write the sheet again");
    expect(note).toContain("Do not run an analysis");
  });
});
