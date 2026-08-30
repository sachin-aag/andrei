import { describe, expect, it } from "vitest";
import { isRedundantInsertImageChip } from "./chat-insert-image-chips";

const assayMeasure = {
  toolName: "insert_image",
  input: {
    section: "measure",
    targetField: "narrative",
    image: { analysisId: "anl_assay" },
  },
};

describe("isRedundantInsertImageChip", () => {
  it("collapses extra available-plots listings", () => {
    const first = {
      toolName: "insert_image",
      output: { status: "available_plots" },
      input: assayMeasure.input,
    };
    const second = {
      toolName: "insert_image",
      output: { status: "available_plots" },
      input: assayMeasure.input,
    };
    expect(isRedundantInsertImageChip([], first)).toBe(false);
    expect(isRedundantInsertImageChip([first], second)).toBe(true);
  });

  it("collapses extra pending inserts of the same Analytics plot", () => {
    const first = { ...assayMeasure };
    const second = { ...assayMeasure };
    expect(isRedundantInsertImageChip([first], second)).toBe(true);
  });

  it("keeps a successful insert after a listing", () => {
    const listing = {
      toolName: "insert_image",
      output: { status: "available_plots" },
      input: assayMeasure.input,
    };
    const proposed = {
      ...assayMeasure,
      output: { status: "proposed" },
    };
    expect(isRedundantInsertImageChip([listing], proposed)).toBe(false);
  });

  it("keeps inserts of the same plot into a different field", () => {
    const first = {
      ...assayMeasure,
      output: { status: "proposed" },
    };
    const second = {
      toolName: "insert_image",
      output: { status: "proposed" },
      input: {
        section: "define",
        targetField: "narrative",
        image: { analysisId: "anl_assay" },
      },
    };
    expect(isRedundantInsertImageChip([first], second)).toBe(false);
  });
});
