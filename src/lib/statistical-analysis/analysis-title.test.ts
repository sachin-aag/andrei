import { describe, expect, it } from "vitest";
import { nextAnalysisTitle, titleForUpdate } from "./analysis-title";

describe("nextAnalysisTitle", () => {
  it("keeps the base name when it is unused", () => {
    expect(nextAnalysisTitle(["Moisture"], "Assay")).toBe("Assay");
  });

  it("suffixes colliding titles so each analysis stays distinct", () => {
    expect(nextAnalysisTitle(["Assay"], "Assay")).toBe("Assay (2)");
    expect(nextAnalysisTitle(["Assay", "Assay (2)"], "Assay")).toBe("Assay (3)");
  });

  it("treats blank input as Analysis", () => {
    expect(nextAnalysisTitle([], "  ")).toBe("Analysis");
    expect(nextAnalysisTitle(["Analysis"], "")).toBe("Analysis (2)");
  });
});

describe("titleForUpdate", () => {
  it("keeps the current title when the requested title is unchanged", () => {
    expect(titleForUpdate(["Assay", "Moisture"], "Assay", "Assay", "Assay")).toBe(
      "Assay"
    );
  });

  it("renames without colliding with the row being edited", () => {
    expect(
      titleForUpdate(["Assay", "Moisture"], "Assay", "Moisture", "Assay")
    ).toBe("Moisture (2)");
  });
});
