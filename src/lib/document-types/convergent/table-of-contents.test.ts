import { describe, expect, it } from "vitest";
import {
  flattenTableOfContents,
  getConvergentTableOfContents,
  getReportTableOfContents,
} from "./table-of-contents";

describe("getConvergentTableOfContents", () => {
  it("nests software DV Methods and Results like the Word recipe", () => {
    const toc = getConvergentTableOfContents("design_verification");
    expect(toc).not.toBeNull();
    expect(toc!.map((e) => e.label)).toEqual([
      "Purpose",
      "Scope",
      "Testers/Dates",
      "Methods of Measurement",
      "Deviations",
      "Results and Discussion",
      "Problem or Failure Resolution",
      "Conclusion",
      "Revision History",
    ]);

    const methods = toc!.find((e) => e.label === "Methods of Measurement");
    expect(methods?.sectionKey).toBeUndefined();
    expect(methods?.children?.map((c) => c.label)).toEqual([
      "Executed Protocol",
      "Protocol Modifications",
      "Units Under Test",
      "Test Equipment",
    ]);
    expect(methods?.children?.map((c) => c.sectionKey)).toEqual([
      "methods_of_measurement",
      "methods_of_measurement",
      "methods_of_measurement",
      "test_equipment",
    ]);

    const results = toc!.find((e) => e.label === "Results and Discussion");
    expect(results?.children?.map((c) => c.sectionKey)).toEqual([
      "results_and_discussions",
      "results_and_discussions",
      "results_and_discussions",
    ]);

    expect(toc!.find((e) => e.label === "Revision History")?.sectionKey).toBeUndefined();
    expect(toc!.find((e) => e.label === "Purpose")?.sectionKey).toBe("purpose");
  });

  it("returns numbered mechanical DV hierarchy matching the export template", () => {
    const toc = getConvergentTableOfContents("mechanical_design_verification");
    expect(toc).not.toBeNull();

    const methods = toc!.find((e) => e.label === "2. Methods of Measurement");
    expect(methods?.children?.map((c) => c.label)).toEqual([
      "2.1 Executed Protocol",
      "2.2 Protocol Deviations",
      "2.3 Units Under Test",
      "2.4 Test Equipment",
    ]);

    const results = toc!.find((e) => e.label === "4. Results and Discussion");
    expect(results?.children?.map((c) => c.sectionKey)).toEqual([
      "data_collection_forms",
      "requirements_verified",
      "observations",
    ]);
  });

  it("returns null for non-Convergent document types", () => {
    expect(getConvergentTableOfContents("investigation_report")).toBeNull();
    expect(getConvergentTableOfContents("generic_document")).toBeNull();
  });
});

describe("getReportTableOfContents", () => {
  it("is gated to the convergent customer pack", () => {
    expect(
      getReportTableOfContents("design_verification", "convergent")
    ).not.toBeNull();
    expect(getReportTableOfContents("design_verification", "demo")).toBeNull();
    expect(getReportTableOfContents("design_verification", "mj")).toBeNull();
  });
});

describe("flattenTableOfContents", () => {
  it("walks parents before nested children", () => {
    const toc = getConvergentTableOfContents("mechanical_design_verification");
    const flat = flattenTableOfContents(toc!);
    const methodsIdx = flat.findIndex(
      (e) => e.label === "2. Methods of Measurement"
    );
    const executedIdx = flat.findIndex(
      (e) => e.sectionKey === "executed_protocol"
    );
    expect(methodsIdx).toBeGreaterThanOrEqual(0);
    expect(executedIdx).toBeGreaterThan(methodsIdx);
  });

  it("puts software Test Equipment under Methods of Measurement", () => {
    const flat = flattenTableOfContents(
      getConvergentTableOfContents("design_verification")!
    );
    const methodsIdx = flat.findIndex(
      (e) => e.label === "Methods of Measurement"
    );
    const equipmentIdx = flat.findIndex((e) => e.label === "Test Equipment");
    expect(methodsIdx).toBeGreaterThanOrEqual(0);
    expect(equipmentIdx).toBeGreaterThan(methodsIdx);
    expect(flat[equipmentIdx]?.sectionKey).toBe("test_equipment");
  });
});
