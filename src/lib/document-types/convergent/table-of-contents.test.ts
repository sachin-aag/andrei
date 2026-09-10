import { describe, expect, it } from "vitest";
import {
  flattenTableOfContents,
  getConvergentTableOfContents,
  getReportTableOfContents,
  numberTableOfContents,
  stripOutlinePrefix,
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
  it("numbers Convergent software DV and demo DV with 1. / 1.1", () => {
    expect(
      getReportTableOfContents("design_verification", "convergent").map(
        (e) => e.label
      )
    ).toEqual([
      "1. Purpose",
      "2. Scope",
      "3. Testers/Dates",
      "4. Methods of Measurement",
      "5. Deviations",
      "6. Results and Discussion",
      "7. Problem or Failure Resolution",
      "8. Conclusion",
      "9. Revision History",
    ]);
    expect(
      getReportTableOfContents("design_verification", "convergent").find(
        (e) => e.label === "4. Methods of Measurement"
      )?.children?.map((c) => c.label)
    ).toEqual([
      "4.1 Executed Protocol",
      "4.2 Protocol Modifications",
      "4.3 Units Under Test",
      "4.4 Test Equipment",
    ]);
    expect(
      getReportTableOfContents("design_verification", "demo").map(
        (e) => e.label
      )
    ).toEqual([
      "1. Cover Page",
      "2. Purpose & Scope",
      "3. References",
      "4. Traceability",
      "5. Test Methods / Protocol Summary",
      "6. Test Results",
      "7. Deviations & Nonconformances",
      "8. Conclusion",
      "9. Approval / Sign-off",
      "10. Appendices",
    ]);
    expect(
      getReportTableOfContents("design_verification", "mj").map((e) => e.label)
    ).toEqual(
      getReportTableOfContents("design_verification", "demo").map((e) => e.label)
    );
  });

  it("numbers investigation sections 1. 2. 3. and subsections 1.1, and omits MJ Conclusion", () => {
    const demo = getReportTableOfContents("investigation_report", "demo");
    expect(demo.map((e) => e.label)).toEqual([
      "1. Define",
      "2. Measure",
      "3. Analyze",
      "4. Improve",
      "5. Control",
      "6. Conclusion",
      "7. Document Reviewed",
    ]);
    expect(demo[0]?.children?.map((c) => c.label)).toEqual([
      "1.1 Details Investigation",
    ]);
    expect(
      demo.find((e) => e.label === "3. Analyze")?.children?.map((c) => c.label)
    ).toEqual([
      "3.1 6 M Method",
      "3.2 5 Why Approach",
      "3.3 Brainstorming",
      "3.4 Other Tool if Any",
      "3.5 Investigation Outcome",
      "3.6 Identified Root Cause / Probable Cause",
      "3.7 Impact Assessment",
    ]);
    expect(
      demo.find((e) => e.label === "4. Improve")?.children?.map((c) => c.label)
    ).toEqual(["4.1 Corrective Action"]);
    expect(
      demo.find((e) => e.label === "5. Control")?.children?.map((c) => c.label)
    ).toEqual(["5.1 Preventive Action"]);
    expect(
      demo.find((e) => e.label === "7. Document Reviewed")?.children?.map(
        (c) => c.label
      )
    ).toEqual(["7.1 List of attachment"]);

    const mj = getReportTableOfContents("investigation_report", "mj");
    expect(mj.map((e) => e.label)).toEqual([
      "1. Define",
      "2. Measure",
      "3. Analyze",
      "4. Improve",
      "5. Control",
      "6. Document Reviewed",
    ]);
    expect(mj.map((e) => e.label)).not.toContain("6. Conclusion");
  });

  it("renumbers QRA F02 headings onto 1. / 1.1 and keeps editor section keys", () => {
    const toc = getReportTableOfContents("quality_risk_assessment", "mj");
    expect(toc.map((e) => e.label)).toEqual([
      "1. Pre-approval (Before Implementation)",
      "2. Details of the Risk Assessment",
      "3. Risk Identification and Evaluation",
      "4. Risk Communication",
      "5. Mitigation Plan and Closure",
      "6. Revision History",
      "7. Post-approval (After Implementation)",
    ]);
    const details = toc.find((e) => e.label === "2. Details of the Risk Assessment");
    expect(details?.sectionKey).toBeUndefined();
    expect(details?.children?.map((c) => c.label)).toEqual([
      "2.1 Objective",
      "2.2 Scope",
      "2.3 System / Equipment / Instrument Overview",
      "2.4 Procedure",
      "2.5 Risk Assessment Team Members",
      "2.6 Risk Identification",
      "2.7 Risk Measurement by Failure Mode Effect Analysis",
      "2.8 Risk Assessment Approach",
    ]);
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
      toc.find((e) => e.label === "1. Pre-approval (Before Implementation)")
        ?.sectionKey
    ).toBeUndefined();
  });

  it("renumbers ELR 1.0 / 3.1 onto 1. / 3.1 and maps recommendation onto conclusion", () => {
    const toc = getReportTableOfContents("equipment_lifecycle_report", "mj");
    expect(toc[0]).toEqual({ label: "1. Purpose", sectionKey: "elr_objective" });

    const observations = toc.find((e) => e.label === "3. Observations and Results");
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
    expect(toc.find((e) => e.label === "6. Recommendation")?.sectionKey).toBe(
      "elr_conclusion"
    );
    expect(toc.find((e) => e.label === "9. Approval Page")?.sectionKey).toBeUndefined();
  });

  it("returns a numbered body row for generic documents", () => {
    expect(getReportTableOfContents("generic_document", "demo")).toEqual([
      { label: "1. Document", sectionKey: "body" },
    ]);
  });
});

describe("numberTableOfContents", () => {
  it("does not treat 6 M Method as an outline number", () => {
    expect(stripOutlinePrefix("6 M Method")).toBe("6 M Method");
    expect(
      numberTableOfContents([
        {
          label: "Analyze",
          children: [{ label: "6 M Method", sectionKey: "analyze" }],
        },
      ])[0]?.children?.[0]?.label
    ).toBe("1.1 6 M Method");
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
