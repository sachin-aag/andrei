import fs from "node:fs";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import {
  getInvestigationCriteriaBySection,
  getInvestigationEvaluatableSections,
} from "@/lib/ai/criteria";
import { buildInvestigationReportDefinition } from "@/lib/document-types/investigation-report";
import { engineerReportsSubtitle } from "@/lib/document-types";
import { seedableSections } from "@/lib/document-types/types";
import { MJ_CRITERION_DESCRIPTION_OVERRIDES } from "./mj/criterion-overrides";
import { MJ_PROMPT_VERSION } from "./mj/prompts";
import { applyCriterionDescriptionOverrides } from "./overrides";
import { DEMO_PACK, MJ_PACK, isDocumentTypeEnabled } from "./packs";

describe("MJ customer pack content", () => {
  it("applies every override key onto the shared criteria list", () => {
    const bySection = getInvestigationCriteriaBySection(MJ_PACK);
    const personnel = bySection.define?.find((c) => c.key === "define.personnel");
    expect(personnel?.description).toContain("Emp. ID");
    expect(
      getInvestigationCriteriaBySection(DEMO_PACK).define?.find(
        (c) => c.key === "define.personnel"
      )?.description
    ).not.toContain("Emp. ID");
  });

  it("accepts every MJ override key against the shared criteria list", () => {
    expect(() =>
      applyCriterionDescriptionOverrides(
        getInvestigationCriteriaBySection(DEMO_PACK),
        MJ_CRITERION_DESCRIPTION_OVERRIDES
      )
    ).not.toThrow();
  });

  it("uses a distinct MJ prompt version and SOP-branded eval prompt", () => {
    const def = buildInvestigationReportDefinition(MJ_PACK);
    expect(def.prompts.promptVersion).toBe(MJ_PROMPT_VERSION);
    expect(def.prompts.promptVersion).not.toBe(DEMO_PACK.promptVersion);
    expect(def.prompts.base).toContain("SOP/DP/QA/008");
    expect(def.prompts.base).toContain("M.J. Biopharm");
    expect(def.prompts.perSection.define).toContain("Emp. ID");
    expect(def.prompts.perSection.analyze).toContain("SOP/DP/QA/008-F04");
    expect(def.prompts.perSection.analyze).not.toContain("Brainstorming");
    expect(def.prompts.perSection.conclusion).toBeUndefined();

    const demo = buildInvestigationReportDefinition(DEMO_PACK);
    expect(demo.prompts.base).not.toContain("SOP/DP/QA/008");
    expect(demo.prompts.perSection.analyze).toContain("Brainstorming");
    expect(demo.prompts.perSection.conclusion).toBeTruthy();
  });

  it("hides conclusion from sections, criteria, chat, and Improve AI eval list", () => {
    const def = buildInvestigationReportDefinition(MJ_PACK);
    expect(def.sections.map((s) => s.key)).not.toContain("conclusion");
    expect(def.criteriaBySection.conclusion).toBeUndefined();
    expect(def.chat.draftOrder).not.toContain("conclusion");
    expect(def.chat.sectionIntentPatterns.map(([key]) => key)).not.toContain(
      "conclusion"
    );
    expect(def.chat.persona).not.toMatch(/Control, Conclusion/);
    expect(getInvestigationEvaluatableSections(MJ_PACK)).not.toContain(
      "conclusion"
    );
    expect(
      seedableSections(def).map((s) => s.key)
    ).not.toContain("conclusion");
  });

  it("disables design verification", () => {
    expect(MJ_PACK.enabledDocumentTypes).toEqual(["investigation_report"]);
    expect(isDocumentTypeEnabled("design_verification", MJ_PACK)).toBe(false);
    expect(isDocumentTypeEnabled("investigation_report", MJ_PACK)).toBe(true);
    expect(engineerReportsSubtitle([{ label: "Investigation Report" }])).toBe(
      "Create and manage investigation reports."
    );
  });

  it("exports through the MJ Word template, which has no conclusion tag", () => {
    const def = buildInvestigationReportDefinition(MJ_PACK);
    expect(def.export.templatePath).toContain(
      "mj-investigation-report-template.docx"
    );
    expect(fs.existsSync(def.export.templatePath)).toBe(true);
    const xml =
      new PizZip(fs.readFileSync(def.export.templatePath))
        .file("word/document.xml")
        ?.asText() ?? "";
    expect(xml).not.toContain("conclusionNarrativeXml");
    expect(xml).toContain("defineNarrativeXml");
  });

  it("keeps MJ branding distinct from Andrei", () => {
    expect(MJ_PACK.branding.productName).toContain("M.J. Biopharm");
    expect(MJ_PACK.branding.logoSrc).toBe("/logo-mj.png");
    expect(DEMO_PACK.branding.productName).toBe("Andrei");
    expect(fs.existsSync("public/logo-mj.png")).toBe(true);
  });
});
