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

    const improveCorrectivePlain = richJsonToPlainText(sections.improve.correctiveActions);
    expect(improveCorrectivePlain).toContain(
      "Improve section covers the corrective actions"
    );
    expect(improveCorrectivePlain).toContain(
      "Following checkpoint shall be considered as guidance only while finalizing"
    );
    expect(improveCorrectivePlain).toMatch(/4\.\s*Are the identified corrective actions achievable/i);

    const controlPreventivePlain = richJsonToPlainText(sections.control.preventiveActions);
    expect(controlPreventivePlain).toContain(
      "Control section covers the preventive actions"
    );
    expect(controlPreventivePlain).toMatch(/6\.\s*Are the identified preventive actions achievable/i);

    const conclusionText = richJsonToPlainText(sections.conclusion.narrative);
    expect(conclusionText).toContain("brief summary of root cause");
  });
});
