import { describe, expect, it } from "vitest";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import type { DefineSection, MeasureSection } from "@/types/sections";

describe("seedBlankReportSections", () => {
  it("seeds empty free-text fields without template checkpoints", () => {
    const sections = seedBlankReportSections("investigation_report");
    const define = sections.define as DefineSection;
    const measure = sections.measure as MeasureSection;

    expect(richJsonToPlainText(define.narrative).trim()).toBe("");
    expect(richJsonToPlainText(measure.narrative).trim()).toBe("");
  });
});
