import { describe, expect, it } from "vitest";
import {
  XPER_PACK,
  DEMO_PACK,
  MJ_PACK,
  CONVERGENT_PACK,
  VQ_PROMPT_VERSION,
  isDocumentTypeEnabled,
  isInsightsEnabled,
  isStatisticalAnalysisEnabled,
} from "./packs";
import { engineerReportsSubtitle, getDocumentType } from "@/lib/document-types";

describe("3xper customer pack", () => {
  it("enables only vendor qualification", () => {
    expect(XPER_PACK.enabledDocumentTypes).toEqual(["vendor_qualification"]);
    expect(isDocumentTypeEnabled("vendor_qualification", XPER_PACK)).toBe(true);
    expect(isDocumentTypeEnabled("investigation_report", XPER_PACK)).toBe(false);
    expect(isDocumentTypeEnabled("design_verification", XPER_PACK)).toBe(false);
    expect(XPER_PACK.wordImportEnabled).toBe(false);
    expect(XPER_PACK.citationsAtEndOfSection).toBe(true);
    expect(XPER_PACK.expertReviewEnabled).toBe(false);
    expect(isStatisticalAnalysisEnabled(XPER_PACK)).toBe(true);
    expect(isInsightsEnabled(XPER_PACK)).toBe(false);
    expect(XPER_PACK.documentTemplatesEnabled).toBe(false);
    expect(XPER_PACK.voiceInputLanguageCodes).toEqual(["en-US"]);
    expect(XPER_PACK.unsupportedFactPolicy).toBe("block");
    expect(XPER_PACK.promptVersion).toBe(VQ_PROMPT_VERSION);
    expect(XPER_PACK.branding.logoLayout).toBe("wordmark");
    expect(XPER_PACK.branding.heroLogoOnWhite).toBe(true);
    expect(engineerReportsSubtitle([{ label: "Vendor Qualification" }])).toBe(
      "Create and manage vendor qualification reports."
    );
    expect(getDocumentType("vendor_qualification").label).toBe(
      "Vendor Qualification"
    );
  });

  it("does not change demo, MJ, or Convergent enabled types", () => {
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
  });
});
