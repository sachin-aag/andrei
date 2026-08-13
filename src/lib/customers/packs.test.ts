import { describe, expect, it } from "vitest";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import { getInvestigationCriteriaBySection } from "@/lib/ai/criteria";
import { getDocumentType, listDocumentTypes } from "@/lib/document-types";
import { applyCriterionDescriptionOverrides } from "./overrides";
import { DEMO_PACK, MJ_PACK, getCustomerPack, isDocumentTypeEnabled } from "./packs";

describe("customer packs", () => {
  it("defaults to the demo pack", () => {
    expect(getCustomerPack().id).toBe("demo");
  });

  it("keeps MJ identical to demo until the content overlay lands", () => {
    expect({ ...MJ_PACK, id: "demo" }).toEqual(DEMO_PACK);
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

  it("lists both document types on demo", () => {
    expect(listDocumentTypes().map((d) => d.key)).toEqual([
      "investigation_report",
      "design_verification",
    ]);
    expect(isDocumentTypeEnabled("design_verification")).toBe(true);
  });

  it("rejects an override key that is not in the shared investigation criteria", () => {
    expect(() =>
      applyCriterionDescriptionOverrides(getInvestigationCriteriaBySection(), {
        "define.not_a_real_key": "should fail",
      })
    ).toThrow(/define.not_a_real_key/);
  });
});
