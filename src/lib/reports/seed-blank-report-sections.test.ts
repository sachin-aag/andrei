import { describe, expect, it } from "vitest";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

describe("seedBlankReportSections", () => {
  it("seeds define, measure, improve, and control with template checkpoints", () => {
    const sections = seedBlankReportSections();

    const defineText = richJsonToPlainText(sections.define.narrative);
    expect(defineText).toContain("Following checks shall be considered");
    expect(defineText).toContain("Clearly define what happens actually");

    const measureText = richJsonToPlainText(sections.measure.narrative);
    expect(measureText).toContain("Does the summary provide relevant facts");

    expect(sections.improve.correctiveActions).toContain(
      "Improve section covers the corrective actions"
    );
    expect(sections.improve.correctiveActions).toContain(
      "Following checkpoint shall be considered as guidance only while finalizing"
    );
    expect(sections.improve.correctiveActions).toMatch(/4\.\s*Are the identified corrective actions achievable/i);

    expect(sections.control.preventiveActions).toContain(
      "Control section covers the preventive actions"
    );
    expect(sections.control.preventiveActions).toMatch(/12\.\s*Are the identified preventive actions achievable/i);
  });
});
