import { describe, expect, it } from "vitest";
import {
  buildAdminDocumentPromptCatalog,
  listAdminDocumentPromptCatalogs,
} from "@/lib/admin/document-prompts";

describe("document-prompts", () => {
  it("lists catalogs for enabled document types", () => {
    const catalogs = listAdminDocumentPromptCatalogs();
    expect(catalogs.length).toBeGreaterThan(0);
    for (const catalog of catalogs) {
      expect(catalog.blocks.length).toBeGreaterThan(0);
      expect(catalog.versions.eval).toBeTruthy();
      expect(catalog.versions.chat).toBeTruthy();
      expect(catalog.versions.suggest).toBeTruthy();
    }
  });

  it("includes eval and chat blocks for mechanical DV when enabled", () => {
    const catalogs = listAdminDocumentPromptCatalogs();
    const mechanical = catalogs.find(
      (c) => c.documentType === "mechanical_design_verification"
    );
    if (!mechanical) return;

    expect(
      mechanical.blocks.some((b) => b.id === "eval-base")
    ).toBe(true);
    expect(
      mechanical.blocks.some((b) => b.id === "chat-drafting")
    ).toBe(true);
    expect(
      mechanical.blocks.some((b) => b.id === "eval-purpose")
    ).toBe(true);
    expect(
      mechanical.blocks.some((b) => b.body.includes("SECTION ROLE - PURPOSE"))
    ).toBe(true);
  });

  it("uses unique block ids within a catalog", () => {
    for (const catalog of listAdminDocumentPromptCatalogs()) {
      const ids = catalog.blocks.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("buildAdminDocumentPromptCatalog returns stable shape", () => {
    const catalog = buildAdminDocumentPromptCatalog("investigation_report");
    expect(catalog.label).toBe("Investigation Report");
    expect(catalog.blocks[0]?.id).toBe("versions");
  });
});
