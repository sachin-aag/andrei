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
  it("keeps Convergent software DV pack-gated", () => {
    expect(
      getReportTableOfContents("design_verification", "convergent")
    ).not.toBeNull();
    expect(getReportTableOfContents("design_verification", "demo")).toBeNull();
    expect(getReportTableOfContents("design_verification", "mj")).toBeNull();
  });

  it("returns the investigation Word recipe and omits MJ Conclusion", () => {
    const demo = getReportTableOfContents("investigation_report", "demo");
    expect(demo).not.toBeNull();
    expect(demo!.map((e) => e.label)).toEqual([
      "Define",
      "Measure",
      "Analyze",
      "Improve",
      "Control",
      "Conclusion",
      "Document Reviewed",
    ]);
    expect(
      demo!.find((e) => e.label === "Analyze")?.children?.map((c) => c.label)
    ).toEqual([
      "6 M Method",
      "5 Why Approach",
      "Brainstorming",
      "Other Tool if Any",
      "Investigation Outcome",
      "Identified Root Cause / Probable Cause",
      "Impact Assessment",
    ]);

    const mj = getReportTableOfContents("investigation_report", "mj");
    expect(mj!.map((e) => e.label)).not.toContain("Conclusion");
    expect(mj!.map((e) => e.label)).toContain("Analyze");
  });

  it("nests QRA F02 headings onto editor sections", () => {
    const toc = getReportTableOfContents("quality_risk_assessment", "mj");
    expect(toc).not.toBeNull();
    expect(toc!.map((e) => e.label)).toEqual([
      "A. Pre-approval (Before Implementation)",
      "1. Details of the Risk Assessment",
      "2. Risk Identification and Evaluation",
      "3. Risk Communication",
      "4. Mitigation Plan and Closure",
      "B. Revision History",
      "C. Post-approval (After Implementation)",
    ]);
    const details = toc!.find((e) => e.label === "1. Details of the Risk Assessment");
    expect(details?.sectionKey).toBeUndefined();
    expect(details?.children?.map((c) => c.sectionKey)).toEqual([
      "qra_objective",
      "qra_scope",
      "qra_overview",
      "qra_procedure",
      "qra_team",
      "qra_risk_identification",
      "qra_fmea",
      "qra_approach",
    ]);
    expect(
      toc!.find((e) => e.label === "A. Pre-approval (Before Implementation)")
        ?.sectionKey
    ).toBeUndefined();
  });

  it("nests ELR observations and maps recommendation onto the conclusion section", () => {
    const toc = getReportTableOfContents("equipment_lifecycle_report", "mj");
    expect(toc).not.toBeNull();
    expect(toc![0]).toEqual({ label: "1.0 Purpose", sectionKey: "elr_objective" });

    const observations = toc!.find((e) => e.label === "3.0 Observations and Results");
    expect(observations?.sectionKey).toBeUndefined();
    expect(observations?.children?.map((c) => c.label)).toEqual([
      "3.1 Responsibility",
      "3.2 Abbreviations",
      "3.3 Equipment and System Description",
      "3.4 Qualification and Periodic Re-Qualification History",
      "3.5 Media Fill / Aseptic Process Simulation",
      "3.6 Monitoring",
      "3.7 Calibration of Associated Instruments",
      "3.8 Preventive Maintenance",
      "3.9 Breakdowns and Trends",
      "3.10 QMS Records since Last Periodic Re-Qualification",
      "3.11 Alarm Trends",
      "3.12 Access Control",
      "3.13 Audit Trail Review",
      "3.14 Computerized System Validation Status",
    ]);
    const breakdowns = observations?.children?.find(
      (c) => c.label === "3.9 Breakdowns and Trends"
    );
    expect(breakdowns?.sectionKey).toBe("elr_breakdowns");
    expect(breakdowns?.children?.[0]).toEqual({
      label: "3.9.1 Breakdown Trend Summary",
      sectionKey: "elr_breakdowns",
    });
    expect(toc!.find((e) => e.label === "6.0 Recommendation")?.sectionKey).toBe(
      "elr_conclusion"
    );
    expect(toc!.find((e) => e.label === "9.0 Approval Page")?.sectionKey).toBeUndefined();
  });

  it("returns null for generic documents", () => {
    expect(getReportTableOfContents("generic_document", "demo")).toBeNull();
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
