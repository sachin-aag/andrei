import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_A4_PAGE_SETUP,
  loadDocxPageSetupFromZip,
  moveSectionBreakBeforeTableCaptions,
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

  it("lands 8+ columns on landscape for the A4 content band", () => {
    expect(tableNeedsLandscapePage(7, 10469)).toBe(false);
    expect(tableNeedsLandscapePage(8, 10469)).toBe(true);
    expect(tableNeedsLandscapePage(9, 10469)).toBe(true);
    expect(tableNeedsLandscapePage(1, 10469)).toBe(false);
  });

  it("lands fewer than 8 columns when equal-width portrait cells would be under 0.5\"", () => {
    expect(tableNeedsLandscapePage(7, 5000)).toBe(true);
    expect(tableNeedsLandscapePage(7, 5040)).toBe(false);
  });

  it("moves a landscape section break to before the table name and title", () => {
    const breakXml =
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>` +
      `<w:sectPr><w:pgSz w:w="11909" w:h="16834"/></w:sectPr></w:pPr></w:p>`;
    const xml =
      `<?xml version="1.0"?><w:document><w:body>` +
      `<w:p><w:r><w:t>Nine stages were reviewed.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Table 3. Qualification history</w:t></w:r></w:p>` +
      breakXml +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>grid</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
      `<w:sectPr><w:pgSz w:w="16834" w:h="11909" w:orient="landscape"/></w:sectPr>` +
      `</w:body></w:document>`;
    const out = moveSectionBreakBeforeTableCaptions(xml);
    const assessmentAt = out.indexOf("Nine stages");
    const breakAt = out.indexOf("<w:p><w:pPr>");
    const captionAt = out.indexOf("Table 3. Qualification history");
    const tableAt = out.indexOf("<w:tbl>");
    expect(breakAt).toBeGreaterThan(assessmentAt);
    expect(captionAt).toBeGreaterThan(breakAt);
    expect(tableAt).toBeGreaterThan(captionAt);
  });

  it("moves the break before a split table name and title in the template", () => {
    const breakXml =
      `<w:p><w:pPr><w:sectPr><w:pgSz w:w="11909" w:h="16834"/></w:sectPr></w:pPr></w:p>`;
    const xml =
      `<?xml version="1.0"?><w:document><w:body>` +
      `<w:p><w:r><w:t>Table 4:</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Requirements Verified</w:t></w:r></w:p>` +
      breakXml +
      `<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>` +
      `<w:sectPr><w:pgSz w:w="16834" w:h="11909" w:orient="landscape"/></w:sectPr>` +
      `</w:body></w:document>`;
    const out = moveSectionBreakBeforeTableCaptions(xml);
    expect(out.indexOf("Table 4:")).toBeGreaterThan(out.indexOf("<w:sectPr>"));
    expect(out.indexOf("Requirements Verified")).toBeGreaterThan(
      out.indexOf("Table 4:")
    );
    expect(out.indexOf("<w:tbl>")).toBeGreaterThan(
      out.indexOf("Requirements Verified")
    );
  });
});
