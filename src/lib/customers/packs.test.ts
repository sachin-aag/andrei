import { describe, expect, it } from "vitest";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import { getInvestigationCriteriaBySection } from "@/lib/ai/criteria";
import { getDocumentType, listDocumentTypes, engineerReportsSubtitle } from "@/lib/document-types";
import { applyCriterionDescriptionOverrides } from "./overrides";
import { DEMO_PACK, CONVERGENT_PACK, MJ_PACK, getCustomerPack, isDocumentTypeEnabled } from "./packs";

describe("customer packs (demo)", () => {
  it("defaults to the demo pack", () => {
    expect(getCustomerPack().id).toBe("demo");
  });

  it("uses the shared investigation template and prompt version on demo", () => {
    expect(DEMO_PACK.investigationTemplateFile).toBe(
      "investigation-report-template.docx"
    );
    expect(DEMO_PACK.promptVersion).toBe(PROMPT_VERSION);
    expect(getDocumentType("investigation_report").export.templatePath).toContain(
      "investigation-report-template.docx"
    );
    expect(getDocumentType("investigation_report").prompts.promptVersion).toBe(
      PROMPT_VERSION
    );
  });

  it("keeps Word import off on demo", () => {
    expect(DEMO_PACK.wordImportEnabled).toBe(false);
  });

  it("lists both document types on demo", () => {
    expect(listDocumentTypes().map((d) => d.key)).toEqual([
      "investigation_report",
      "design_verification",
    ]);
    expect(isDocumentTypeEnabled("design_verification")).toBe(true);
  });

  it("describes both document types on the demo dashboard", () => {
    expect(engineerReportsSubtitle(listDocumentTypes())).toBe(
      "Create and manage investigation and design verification reports."
    );
  });

  it("keeps SOP-specific strings out of the demo eval prompt", () => {
    expect(DEMO_PACK.evaluationSystemPrompt).not.toContain("SOP/DP/QA/008");
    expect(DEMO_PACK.evaluationSystemPrompt).not.toContain("M.J. Biopharm");
  });

  it("rejects an override key that is not in the shared investigation criteria", () => {
    expect(() =>
      applyCriterionDescriptionOverrides(getInvestigationCriteriaBySection(), {
        "define.not_a_real_key": "should fail",
      })
    ).toThrow(/define.not_a_real_key/);
  });
});

describe("customer packs (convergent isolation)", () => {
  it("enables only the two Convergent document types", () => {
    expect([...CONVERGENT_PACK.enabledDocumentTypes]).toEqual([
      "verification_protocol",
      "verification_test_report",
    ]);
  });

  it("demo and MJ enable neither Convergent type", () => {
    expect(isDocumentTypeEnabled("verification_protocol", DEMO_PACK)).toBe(
      false
    );
    expect(isDocumentTypeEnabled("verification_test_report", DEMO_PACK)).toBe(
      false
    );
    expect(isDocumentTypeEnabled("verification_protocol", MJ_PACK)).toBe(false);
    expect(isDocumentTypeEnabled("verification_test_report", MJ_PACK)).toBe(
      false
    );
    expect(
      isDocumentTypeEnabled("investigation_report", CONVERGENT_PACK)
    ).toBe(false);
    expect(
      isDocumentTypeEnabled("design_verification", CONVERGENT_PACK)
    ).toBe(false);
  });

  it("keeps Word import off on convergent", () => {
    expect(CONVERGENT_PACK.wordImportEnabled).toBe(false);
  });
});
