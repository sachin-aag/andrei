import { describe, expect, it } from "vitest";
import { PRIMARY_DATA_SHEET_ID } from "@/lib/statistical-analysis/types";
import {
  addDataSheet,
  createEmptyWorksheet,
} from "@/lib/statistical-analysis/worksheet";
import { chatSheetOptionsFromWorksheet } from "./worksheet-sheet-options";

describe("chatSheetOptionsFromWorksheet", () => {
  it("lists data sheet ids and names for Analytics @ tags", () => {
    const sheets = chatSheetOptionsFromWorksheet(
      addDataSheet(createEmptyWorksheet(), "Assay")
    );
    expect(sheets).toEqual([
      { id: PRIMARY_DATA_SHEET_ID, name: "Data" },
      expect.objectContaining({ name: "Assay" }),
    ]);
  });
});
