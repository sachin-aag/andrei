import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_A4_PAGE_SETUP,
  loadDocxPageSetupFromZip,
  tableNeedsLandscapePage,
  toLandscapeSectPr,
} from "@/lib/export/docx-page-setup";

describe("docx page setup", () => {
  it("reads A4 portrait geometry from the investigation template", () => {
    const zip = new PizZip(
      fs.readFileSync(
        path.join(process.cwd(), "templates", "investigation-report-template.docx")
      )
    );
    const setup = loadDocxPageSetupFromZip(zip);
    expect(setup.portraitContentWidthDxa).toBe(10469);
    expect(setup.landscapeContentWidthDxa).toBe(15394);
    expect(setup.portraitSectPr).toContain('w:w="11909"');
    expect(setup.landscapeSectPr).toContain('w:orient="landscape"');
    expect(setup.landscapeSectPr).toContain('w:headerReference w:type="default"');
  });

  it("reads Letter geometry from the Convergent DV template", () => {
    const zip = new PizZip(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "templates",
          "convergent-design-verification-report-template.docx"
        )
      )
    );
    const setup = loadDocxPageSetupFromZip(zip);
    expect(setup.portraitContentWidthDxa).toBe(9360);
    expect(setup.landscapeContentWidthDxa).toBe(12960);
  });

  it("swaps page size and marks landscape without dropping paper code", () => {
    const landscape = toLandscapeSectPr(DEFAULT_A4_PAGE_SETUP.portraitSectPr);
    expect(landscape).toContain('w:w="16834"');
    expect(landscape).toContain('w:h="11909"');
    expect(landscape).toContain('w:orient="landscape"');
    expect(landscape).toContain('w:code="9"');
  });

  it("lands 15+ equal columns on landscape for the A4 content band", () => {
    expect(tableNeedsLandscapePage(14, 10469)).toBe(false);
    expect(tableNeedsLandscapePage(15, 10469)).toBe(true);
    expect(tableNeedsLandscapePage(19, 10469)).toBe(true);
    expect(tableNeedsLandscapePage(1, 10469)).toBe(false);
  });
});
