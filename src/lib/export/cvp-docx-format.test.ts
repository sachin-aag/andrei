import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyCvpEmptyFirstColumnMerges,
  applyCvpSourceTableColWidths,
  CVP_DOCX_HEADING_NUM_ID,
  cvpHeadingCaps,
  cvpTemplateHeadingSpec,
  cvpWordTocXml,
  stripCvpOutlineNumber,
  stripTableCaptionNodes,
} from "./cvp-docx-format";
import { cvpSourceColWidthsForHeaders } from "./cvp-table-col-widths";

function cell(text: string): JSONContent {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1 },
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function row(cells: string[]): JSONContent {
  return { type: "tableRow", content: cells.map(cell) };
}

describe("cvp-docx-format", () => {
  it("strips baked outline numbers and uppercases Heading1 labels", () => {
    expect(stripCvpOutlineNumber("15.1 Mixed Vessel (MV-1304)")).toBe(
      "Mixed Vessel (MV-1304)"
    );
    expect(cvpHeadingCaps("1.0 Approval Signatures")).toBe("APPROVAL SIGNATURES");
    expect(cvpTemplateHeadingSpec("cvp_approvals")).toEqual({
      text: "APPROVAL SIGNATURES",
      ilvl: 0,
    });
    expect(cvpTemplateHeadingSpec("cvp_nitrosamine")).toEqual({
      text: "NITROSAMINE LIMITS IN THE RINSE SAMPLES",
      ilvl: 1,
    });
    expect(CVP_DOCX_HEADING_NUM_ID).toBe(3);
  });

  it("emits a Word TOC field for Heading1 only", () => {
    const xml = cvpWordTocXml();
    expect(xml).toContain(" TOC \\o \"1-1\" ");
    expect(xml).toContain('<w:pStyle w:val="TOCHeading"/>');
    expect(xml).toContain("TABLE OF CONTENTS");
    expect(xml).not.toContain("<w:tbl>");
  });

  it("merges consecutive empty first-column cells into a rowspan", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            row(["Function", "Department"]),
            row(["Prepared by", "QA"]),
            row(["Reviewed by", "Production"]),
            row(["", "Technology Transfer"]),
            row(["", "Quality Control"]),
            row(["Approved by", "QA"]),
          ],
        },
      ],
    };
    const table = applyCvpEmptyFirstColumnMerges(doc).content?.[0];
    const rows = table?.content ?? [];
    expect(rows[2]?.content?.[0]?.attrs?.rowspan).toBe(3);
    expect(rows[3]?.content).toHaveLength(1);
    expect(rows[4]?.content).toHaveLength(1);
    expect(rows[5]?.content?.[0]?.attrs?.rowspan).toBe(1);
  });

  it("drops Table N. caption paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 1. Responsibilities" }],
        },
        { type: "table", content: [row(["Department", "Role"])] },
      ],
    };
    const next = stripTableCaptionNodes(doc);
    expect(next.content).toHaveLength(1);
    expect(next.content?.[0]?.type).toBe("table");
  });

  it("maps source protocol column widths by table headers", () => {
    expect(
      cvpSourceColWidthsForHeaders([
        "Function",
        "Department",
        "Name",
        "Designation",
        "Sign & date",
      ])
    ).toEqual([1524, 2340, 2225, 2020, 1773]);
    expect(
      cvpSourceColWidthsForHeaders(["S. No", "Surface Type", "WAF (L/m²)"])
    ).toEqual([838, 3251, 1996]);
    expect(
      cvpSourceColWidthsForHeaders([
        "S. No",
        "Name of the Equipment",
        "Equipment No.",
        "Capacity",
        "Internal surface area m²",
        "Rinsing Volume (L) based on RF Formula= SA X RF",
        "Rinsing Volume based on SAF Formula = SAXSAFXSF",
        "Considered volume",
        "Rinsing Sample Quantity",
      ])
    ).toEqual([460, 1172, 1172, 983, 915, 1407, 1595, 1194, 984]);
    expect(
      cvpSourceColWidthsForHeaders([
        "Sample description / location",
        "Sample ID",
        "Results (Extraneous matter)",
      ])
    ).toEqual([4494, 1214, 4097]);
    expect(
      cvpSourceColWidthsForHeaders(["Unknown", "Headers"])
    ).toBeNull();
  });

  it("stamps source colWidths onto matching tables", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            row(["Function", "Department", "Name", "Designation", "Sign & date"]),
            row(["Prepared by", "QA", "", "", ""]),
          ],
        },
      ],
    };
    const table = applyCvpSourceTableColWidths(doc).content?.[0];
    expect(table?.attrs?.colWidths).toEqual([1524, 2340, 2225, 2020, 1773]);
  });
});
