import { describe, expect, it } from "vitest";
import { directorySegmentsFromRelativePath } from "./library-relative-path";

describe("directorySegmentsFromRelativePath", () => {
  it("strips the filename from a webkitRelativePath", () => {
    expect(
      directorySegmentsFromRelativePath("Quality/SOP/coa.pdf", "coa.pdf")
    ).toEqual(["Quality", "SOP"]);
  });

  it("returns an empty list when the path is only the file", () => {
    expect(directorySegmentsFromRelativePath("coa.pdf", "coa.pdf")).toEqual([]);
    expect(directorySegmentsFromRelativePath(undefined, "coa.pdf")).toEqual([]);
  });

  it("keeps segments when the path is directories only", () => {
    expect(
      directorySegmentsFromRelativePath("Quality/SOP", "coa.pdf")
    ).toEqual(["Quality", "SOP"]);
  });
});
