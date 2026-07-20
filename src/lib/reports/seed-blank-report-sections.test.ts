import { describe, expect, it } from "vitest";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

describe("seedBlankReportSections", () => {
  it("seeds empty free-text fields without template checkpoints", () => {
    const sections = seedBlankReportSections();

    expect(richJsonToPlainText(sections.define.narrative).trim()).toBe("");
    expect(richJsonToPlainText(sections.measure.narrative).trim()).toBe("");
    expect(richJsonToPlainText(sections.improve.correctiveActions).trim()).toBe("");
    expect(richJsonToPlainText(sections.control.preventiveActions).trim()).toBe("");
    expect(richJsonToPlainText(sections.conclusion.narrative).trim()).toBe("");
  });
});
