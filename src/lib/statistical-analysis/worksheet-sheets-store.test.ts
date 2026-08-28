import { afterEach, describe, expect, it } from "vitest";
import {
  publishWorksheetSheets,
  readWorksheetSheets,
  resetWorksheetSheetsStore,
  unpublishLiveWorksheetSheets,
  worksheetSheetsAreLive,
} from "./worksheet-sheets-store";

describe("worksheet sheets store", () => {
  afterEach(() => {
    resetWorksheetSheetsStore();
  });

  it("publishes live tabs and keeps them after unpublish", () => {
    publishWorksheetSheets(
      "rep-1",
      [
        { id: "data-1", name: "Data" },
        { id: "data-2", name: "Assay" },
      ],
      { live: true }
    );
    expect(readWorksheetSheets("rep-1")).toEqual([
      { id: "data-1", name: "Data" },
      { id: "data-2", name: "Assay" },
    ]);
    expect(worksheetSheetsAreLive("rep-1")).toBe(true);
    unpublishLiveWorksheetSheets("rep-1");
    expect(worksheetSheetsAreLive("rep-1")).toBe(false);
    expect(readWorksheetSheets("rep-1")).toHaveLength(2);
  });
});
