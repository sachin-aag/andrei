import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERGENT_PACK,
  CONVERGENT_PROMPT_VERSION,
  DEMO_PACK,
  MJ_PACK,
  isDocumentTypeEnabled,
} from "./packs";
import { buildDesignVerificationDefinition } from "@/lib/document-types/design-verification";
import { engineerReportsSubtitle } from "@/lib/document-types";
import {
  CONVERGENT_DV_SECTION_KEYS,
  CONVERGENT_DV_SECTION_LABELS,
} from "@/lib/document-types/convergent/sections";
import {
  CONVERGENT_EQUIPMENT_HEADERS,
  CONVERGENT_RESULTS_HEADERS,
  CONVERGENT_RESULTS_FIELD_SPLIT_NOTES,
  CONVERGENT_RESULTS_MATRIX_FILLING_NOTES,
  dvTableHeadersForSection,
} from "@/lib/document-types/design-verification/sections";

describe("Convergent customer pack", () => {
  it("enables only design verification", () => {
    expect(CONVERGENT_PACK.enabledDocumentTypes).toEqual(["design_verification"]);
    expect(isDocumentTypeEnabled("design_verification", CONVERGENT_PACK)).toBe(
      true
    );
    expect(isDocumentTypeEnabled("investigation_report", CONVERGENT_PACK)).toBe(
      false
    );
    expect(CONVERGENT_PACK.wordImportEnabled).toBe(false);
    expect(CONVERGENT_PACK.citationsAtEndOfSection).toBe(true);
    expect(DEMO_PACK.citationsAtEndOfSection).toBe(false);
    expect(MJ_PACK.citationsAtEndOfSection).toBe(false);
    expect(CONVERGENT_PACK.expertReviewEnabled).toBe(true);
    expect(DEMO_PACK.expertReviewEnabled).toBe(false);
    expect(MJ_PACK.expertReviewEnabled).toBe(false);
    expect(engineerReportsSubtitle([{ label: "Design Verification Report" }])).toBe(
      "Create and manage design verification reports."
    );
  });

  it("does not change demo or MJ enabled types", () => {
    expect(DEMO_PACK.enabledDocumentTypes).toEqual([
      "investigation_report",
      "design_verification",
    ]);
    expect(MJ_PACK.enabledDocumentTypes).toEqual(["investigation_report"]);
  });

  it("uses convergent DV sections, table headers, and prompt version", () => {
    const def = buildDesignVerificationDefinition(CONVERGENT_PACK);
    expect(def.prompts.promptVersion).toBe(CONVERGENT_PROMPT_VERSION);
    expect(def.prompts.promptVersion).toBe("convergent-dv-v5");
    expect(def.sections.map((s) => s.key)).toEqual([...CONVERGENT_DV_SECTION_KEYS]);
    expect(def.sections.find((s) => s.key === "cover_page")).toBeUndefined();
    expect(CONVERGENT_DV_SECTION_LABELS.purpose).toBe("Purpose");
    expect(dvTableHeadersForSection("test_equipment")).toEqual([
      ...CONVERGENT_EQUIPMENT_HEADERS,
    ]);
    expect(dvTableHeadersForSection("results_and_discussions")).toEqual([
      ...CONVERGENT_RESULTS_HEADERS,
    ]);
    expect(def.export.templatePath).toContain(
      "convergent-design-verification-report-template.docx"
    );
    expect(def.chat.draftOrder[0]).toBe("purpose");
    expect(def.chat.persona).toContain(
      "Satisfied By must name the configuration for which each P/F was achieved"
    );
    expect(def.chat.draftingGuidance).toContain(
      CONVERGENT_RESULTS_MATRIX_FILLING_NOTES
    );
    expect(def.chat.draftingGuidance).toContain(
      CONVERGENT_RESULTS_FIELD_SPLIT_NOTES
    );
    expect(def.chat.draftingGuidance).toContain("SW-SST-5.1.1");
    expect(def.chat.draftingGuidance).toContain(
      "not every requirement ID mentioned in the protocol body"
    );
    expect(def.chat.draftingGuidance).toContain(
      "configuration for which that P/F was achieved"
    );
    expect(def.chat.draftingGuidance).toContain(
      "NEVER include a markdown table or Req ID / Satisfied By / P/F rows here"
    );
    expect(def.chat.draftingGuidance).toContain(
      "Do not put that table, or any Req ID / P/F rows, in Discussion"
    );
    expect(def.chat.draftingGuidance).toContain(
      "There are no separate start/end date fields"
    );
    expect(
      def.criteriaBySection.testers_dates?.find((c) => c.key === "testers.dates")
        ?.description
    ).toContain("written in the Testers narrative");
    expect(
      def.criteriaBySection.results_and_discussions?.find(
        (c) => c.key === "results.satisfied_by"
      )?.description
    ).toContain("configuration for which P/F was achieved");
    expect(
      def.criteriaBySection.purpose?.find(
        (criterion) => criterion.key === "purpose.objective"
      )?.label
    ).toBe("Verification objective is clearly stated");
  });

  it("keeps the demo DV 10-section shape", () => {
    const def = buildDesignVerificationDefinition(DEMO_PACK);
    expect(def.prompts.promptVersion).toBe("dv-checklist-v1");
    expect(def.sections.map((s) => s.key)).toEqual([
      "cover_page",
      "purpose_scope",
      "references",
      "traceability",
      "test_methods",
      "test_results",
      "deviations",
      "conclusion",
      "approval_signoff",
      "appendices",
    ]);
    expect(def.chat.draftingGuidance).not.toContain(
      CONVERGENT_RESULTS_MATRIX_FILLING_NOTES
    );
    expect(def.chat.draftingGuidance).not.toContain(
      CONVERGENT_RESULTS_FIELD_SPLIT_NOTES
    );
  });

  it("uses Convergent Dental branding and logo files", () => {
    expect(CONVERGENT_PACK.branding.productName).toBe("Convergent Dental");
    expect(CONVERGENT_PACK.branding.loginHeadline).toContain(
      "Design verification"
    );
    expect(CONVERGENT_PACK.branding.loginFooter).toBe("Andrei Health");
    expect(CONVERGENT_PACK.branding.aiAttribution).toBe("by Andrei");
    expect(CONVERGENT_PACK.branding.heroLogoOnWhite).toBe(true);
    expect(CONVERGENT_PACK.branding.logoSrc).toBe("/logo-convergent.png");
    expect(CONVERGENT_PACK.branding.logoWhiteSrc).toBe(
      "/logo-convergent-white.png"
    );
    expect(CONVERGENT_PACK.branding.logoMarkSrc).toBe(
      "/logo-convergent-mark.svg"
    );
    expect(CONVERGENT_PACK.branding.logoLayout).toBe("wordmark");
    expect(
      fs.existsSync(path.join(process.cwd(), "public/logo-convergent.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "public/logo-convergent-white.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "public/logo-convergent-mark.svg"))
    ).toBe(true);
  });
});
