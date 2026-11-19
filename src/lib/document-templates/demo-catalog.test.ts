import { describe, expect, it } from "vitest";
import {
  DEMO_PACK,
  MJ_PACK,
  CONVERGENT_PACK,
  XPER_PACK,
} from "@/lib/customers/packs";
import {
  BLANK_DOCUMENT_TEMPLATE,
  DEMO_DOCUMENT_TEMPLATES,
  DEMO_TEMPLATE_SECTIONS,
  demoTemplateById,
  demoTemplateHasPlaceholderWordExport,
  demoTemplateMetadata,
  demoTemplateTitleFromMetadata,
  isDocumentTemplatesEnabled,
  listedDemoTemplates,
  listedDemoTemplatesInSection,
  resolveEnabledDemoTemplate,
  templatePreviewLines,
} from "./index";

describe("demo document templates", () => {
  it("is on for demo and off for other packs", () => {
    expect(isDocumentTemplatesEnabled(DEMO_PACK)).toBe(true);
    expect(isDocumentTemplatesEnabled(MJ_PACK)).toBe(false);
    expect(isDocumentTemplatesEnabled(CONVERGENT_PACK)).toBe(false);
    expect(isDocumentTemplatesEnabled(XPER_PACK)).toBe(false);
  });

  it("lists five gallery sections", () => {
    expect(DEMO_TEMPLATE_SECTIONS.map((section) => section.id)).toEqual([
      "supply_chain",
      "design",
      "operations",
      "quality",
      "ma_integration",
    ]);
  });

  it("lists M&A Integration templates in order as generic documents", () => {
    const ma = listedDemoTemplatesInSection("ma_integration");
    expect(ma.map((t) => t.id)).toEqual([
      "document-template-transfer",
      "dhf-dmr-transfer",
      "risk-file-transfer",
      "eco-migration",
      "supplier-vendor-transfer",
      "quality-agreement-transfer",
      "equipment-qualification-transfer",
      "process-test-method-transfer",
      "part-bom-migration",
      "complaint-capa-migration",
    ]);
    expect(ma.every((t) => t.documentType === "generic_document")).toBe(true);
  });

  it("hides the blank document from section grids", () => {
    expect(BLANK_DOCUMENT_TEMPLATE.listed).toBe(false);
    expect(listedDemoTemplates().some((t) => t.id === "blank-document")).toBe(
      false
    );
    expect(demoTemplateById("blank-document")?.documentType).toBe(
      "generic_document"
    );
  });

  it("lists Supply Chain templates in auditor-logical order", () => {
    const supply = listedDemoTemplatesInSection("supply_chain");
    expect(supply.map((t) => t.id)).toEqual([
      "supplier-control-procedure",
      "supplier-risk-classification",
      "approved-supplier-list",
      "vendor-qualification",
      "vendor-qualification-report",
      "supplier-audit-report",
      "quality-agreement",
      "purchase-order-purchasing-data",
      "incoming-inspection-coc-coa",
      "supplier-corrective-action-request",
    ]);
    expect(supply.every((t) => t.documentType === "generic_document")).toBe(
      true
    );
  });

  it("maps design verification and deviations to structured types", () => {
    expect(demoTemplateById("design-verification")?.documentType).toBe(
      "design_verification"
    );
    expect(demoTemplateById("deviations")?.documentType).toBe(
      "investigation_report"
    );
    expect(demoTemplateById("design-verification")?.outlineMarkdown).toBeUndefined();
    expect(demoTemplateById("deviations")?.outlineMarkdown).toBeUndefined();
  });

  it("treats only Deviations and Design Verification as real Word export", () => {
    const ready = listedDemoTemplates().filter(
      (template) => !demoTemplateHasPlaceholderWordExport(template)
    );
    expect(ready.map((template) => template.id).toSorted()).toEqual([
      "design-verification",
      "deviations",
    ]);
    expect(
      demoTemplateHasPlaceholderWordExport(demoTemplateById("capa")!)
    ).toBe(true);
    expect(
      demoTemplateHasPlaceholderWordExport(BLANK_DOCUMENT_TEMPLATE)
    ).toBe(true);
  });

  it("gives every listed template a title, description, and preview lines", () => {
    for (const template of listedDemoTemplates()) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(templatePreviewLines(template).length).toBeGreaterThan(0);
      if (template.documentType === "generic_document") {
        expect(template.outlineMarkdown?.includes("#")).toBe(true);
      }
    }
  });

  it("resolves templates only when the pack enables the gallery", () => {
    expect(resolveEnabledDemoTemplate("capa", DEMO_PACK)?.title).toBe("CAPA");
    expect(resolveEnabledDemoTemplate("capa", MJ_PACK)).toBeUndefined();
    expect(resolveEnabledDemoTemplate("not-a-template", DEMO_PACK)).toBeUndefined();
  });

  it("stamps template identity for report metadata", () => {
    const capa = demoTemplateById("capa")!;
    expect(demoTemplateMetadata(capa)).toEqual({
      demoTemplateId: "capa",
      demoTemplateTitle: "CAPA",
      demoTemplateSection: "quality",
    });
    expect(
      demoTemplateTitleFromMetadata({
        demoTemplateTitle: "CAPA",
      })
    ).toBe("CAPA");
    expect(demoTemplateTitleFromMetadata({})).toBeNull();
  });

  it("keeps catalog ids unique", () => {
    const ids = DEMO_DOCUMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
