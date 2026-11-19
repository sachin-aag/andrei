import fs from "node:fs";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { getInvestigationEvaluatableSections } from "@/lib/ai/criteria";
import { COMMON_EVALUATION_SYSTEM_PROMPT } from "@/lib/ai/section-prompts";
import { buildInvestigationReportDefinition } from "@/lib/document-types/investigation-report";
import { engineerReportsSubtitle } from "@/lib/document-types";
import { seedableSections } from "@/lib/document-types/types";
import {
  AMI_PACK,
  AMI_PROMPT_VERSION,
  DEMO_PACK,
  MJ_PACK,
  CONVERGENT_PACK,
  XPER_PACK,
  isDocumentTypeEnabled,
  isInsightsEnabled,
  isStatisticalAnalysisEnabled,
} from "./packs";

describe("Ami Lifesciences customer pack", () => {
  it("enables investigation report only", () => {
    expect(AMI_PACK.enabledDocumentTypes).toEqual(["investigation_report"]);
    expect(isDocumentTypeEnabled("investigation_report", AMI_PACK)).toBe(true);
    expect(isDocumentTypeEnabled("design_verification", AMI_PACK)).toBe(false);
    expect(isDocumentTypeEnabled("failure_investigation_report", AMI_PACK)).toBe(
      false
    );
    expect(isDocumentTypeEnabled("quality_risk_assessment", AMI_PACK)).toBe(
      false
    );
    expect(AMI_PACK.wordImportEnabled).toBe(true);
    expect(AMI_PACK.citationsAtEndOfSection).toBe(true);
    expect(AMI_PACK.expertReviewEnabled).toBe(false);
    expect(isStatisticalAnalysisEnabled(AMI_PACK)).toBe(true);
    expect(isInsightsEnabled(AMI_PACK)).toBe(false);
    expect(AMI_PACK.documentTemplatesEnabled).toBe(false);
    expect(AMI_PACK.voiceInputLanguageCodes).toEqual(["en-US"]);
    expect(AMI_PACK.unsupportedFactPolicy).toBe("block");
    expect(AMI_PACK.promptVersion).toBe(AMI_PROMPT_VERSION);
    expect(AMI_PACK.evaluationSystemPrompt).toBe(COMMON_EVALUATION_SYSTEM_PROMPT);
    expect(AMI_PACK.evaluationSystemPrompt).not.toContain("SOP/DP/QA/008");
    expect(AMI_PACK.evaluationSystemPrompt).not.toContain("M.J. Biopharm");
    expect(AMI_PACK.branding.logoLayout).toBe("wordmark");
    expect(AMI_PACK.branding.heroLogoOnWhite).toBe(true);
    expect(AMI_PACK.branding.productName).toBe("Ami Lifesciences Pvt. Ltd.");
    expect(engineerReportsSubtitle([{ label: "Investigation Report" }])).toBe(
      "Create and manage investigation reports."
    );
    expect(buildInvestigationReportDefinition(AMI_PACK).label).toBe(
      "Investigation Report"
    );
  });

  it("hides conclusion like MJ, without MJ SOP overlays", () => {
    const def = buildInvestigationReportDefinition(AMI_PACK);
    expect(def.sections.map((s) => s.key)).not.toContain("conclusion");
    expect(def.criteriaBySection.conclusion).toBeUndefined();
    expect(def.chat.draftOrder).not.toContain("conclusion");
    expect(getInvestigationEvaluatableSections(AMI_PACK)).not.toContain(
      "conclusion"
    );
    expect(seedableSections(def).map((s) => s.key)).not.toContain("conclusion");
    expect(def.prompts.perSection.define).not.toContain("Emp. ID");
    expect(def.prompts.perSection.analyze).not.toContain("SOP/DP/QA/008-F04");
  });

  it("exports through the Ami Word template, which has no conclusion tag", () => {
    const def = buildInvestigationReportDefinition(AMI_PACK);
    expect(def.export.templatePath).toContain(
      "ami-investigation-report-template.docx"
    );
    expect(fs.existsSync(def.export.templatePath)).toBe(true);
    const xml =
      new PizZip(fs.readFileSync(def.export.templatePath))
        .file("word/document.xml")
        ?.asText() ?? "";
    expect(xml).not.toContain("conclusionNarrativeXml");
    expect(xml).toContain("defineNarrativeXml");
    const header =
      new PizZip(fs.readFileSync(def.export.templatePath))
        .file("word/header2.xml")
        ?.asText() ?? "";
    expect(header).toContain("Ami Lifesciences");
    expect(header).toContain("Vadodara");
    expect(header).not.toContain("M.J.");
    expect(header).not.toContain("Hinjawadi");
    expect(header).not.toContain("SOP/DP/QA/008");
  });

  it("ships Ami logo files", () => {
    expect(fs.existsSync("public/logo-ami.png")).toBe(true);
    expect(fs.existsSync("public/logo-ami-white.png")).toBe(true);
    expect(fs.existsSync("public/logo-ami-mark.png")).toBe(true);
  });

  it("does not change demo, MJ, Convergent, or 3xper enabled types", () => {
    expect(DEMO_PACK.enabledDocumentTypes).toEqual([
      "investigation_report",
      "design_verification",
      "generic_document",
    ]);
    expect(MJ_PACK.enabledDocumentTypes).toEqual([
      "investigation_report",
      "failure_investigation_report",
      "quality_risk_assessment",
      "equipment_lifecycle_report",
    ]);
    expect(CONVERGENT_PACK.enabledDocumentTypes).toEqual([
      "design_verification",
      "mechanical_design_verification",
    ]);
    expect(XPER_PACK.enabledDocumentTypes).toEqual([
      "vendor_qualification",
      "qualification_summary_report",
      "cleaning_verification_protocol",
    ]);
  });
});
