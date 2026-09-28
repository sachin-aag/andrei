import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { qualificationSummaryReportDefinition } from "@/lib/document-types/qualification-summary-report";
import {
  QSR_AUXILIARY_VOLUMETRIC_ROWS,
  QSR_MAIN_VOLUMETRIC_EXTRA_ROWS,
  QSR_MAIN_VOLUMETRIC_ROWS,
  QSR_OTHER_DETAILS_HEADERS,
  QSR_OTHER_DETAILS_ROWS,
  QSR_VOLUMETRIC_HEADERS,
  emptyQsrContent,
  ensureVolumetricFormRows,
} from "./sections";

function otherDetailsBlob(node: { content?: unknown } | undefined): string {
  return JSON.stringify(node ?? "").replace(/\\n/g, " ");
}

function cellText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map((child) => cellText(child)).join("");
}

function tableParameters(table: JSONContent | undefined): string[] {
  return (table?.content ?? [])
    .slice(1)
    .map((row) => cellText(row.content?.[1]).trim());
}

function volumetricTables(doc: JSONContent): JSONContent[] {
  return (doc.content ?? []).filter((node) => node.type === "table");
}

function sixRowMainTable(): JSONContent {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: QSR_VOLUMETRIC_HEADERS.map((header) => ({
          type: "tableHeader",
          content: [{ type: "paragraph", content: [{ type: "text", text: header }] }],
        })),
      },
      ...QSR_MAIN_VOLUMETRIC_ROWS.slice(0, 6).map((row) => ({
        type: "tableRow",
        content: QSR_VOLUMETRIC_HEADERS.map((_, i) => ({
          type: "tableCell",
          content: row[i]
            ? [{ type: "paragraph", content: [{ type: "text", text: row[i] }] }]
            : [{ type: "paragraph" }],
        })),
      })),
    ],
  };
}

function auxiliaryTable(): JSONContent {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: QSR_VOLUMETRIC_HEADERS.map((header) => ({
          type: "tableHeader",
          content: [{ type: "paragraph", content: [{ type: "text", text: header }] }],
        })),
      },
      ...QSR_AUXILIARY_VOLUMETRIC_ROWS.map((row) => ({
        type: "tableRow",
        content: QSR_VOLUMETRIC_HEADERS.map((_, i) => ({
          type: "tableCell",
          content: row[i]
            ? [{ type: "paragraph", content: [{ type: "text", text: row[i] }] }]
            : [{ type: "paragraph" }],
        })),
      })),
    ],
  };
}

describe("QSR Other Details template", () => {
  it("seeds Table 11 Parameter / Details rows including Type of Agitator and Type of Mechanical Seal", () => {
    expect(QSR_OTHER_DETAILS_HEADERS).toEqual(["Parameter", "Details"]);
    expect(QSR_OTHER_DETAILS_ROWS.map((row) => row[0])).toEqual([
      "Total Heat Transfer Area",
      "Agitator Type",
      "Type of Agitator",
      "Pump Type",
      "Type of Mechanical Seal",
      "Mechanical Seal Flushing Media",
      "Mechanical Seal Flushing Pressure",
      "Mechanical Seal Flushing Flow",
    ]);
    const content = emptyQsrContent("qsr_other_details") as {
      narrative: { content?: Array<{ type?: string; content?: unknown[] }> };
    };
    const blob = otherDetailsBlob(content.narrative);
    expect(blob).toContain("Type of Agitator");
    expect(blob).toContain("Type of Mechanical Seal");
    expect(blob).toContain("Agitator Type");
    expect(blob).not.toMatch(/Cryo-Fix Anchor/);
    expect(blob).not.toMatch(/Double Mechanical Seal/);
  });
});

describe("QSR volumetric Table 11 seed", () => {
  it("seeds Inner Surface area and Equipment Dimensions on the main table", () => {
    const content = emptyQsrContent("qsr_volumetric_details") as { narrative: JSONContent };
    const [main, auxiliary] = volumetricTables(content.narrative);
    expect(tableParameters(main)).toEqual(QSR_MAIN_VOLUMETRIC_ROWS.map((row) => row[1]));
    expect(tableParameters(main)).toEqual(
      expect.arrayContaining(QSR_MAIN_VOLUMETRIC_EXTRA_ROWS.map((row) => row[1]))
    );
    expect(tableParameters(auxiliary)).toEqual(
      QSR_AUXILIARY_VOLUMETRIC_ROWS.map((row) => row[1])
    );
  });

  it("appends the extra form rows onto an older six-row main table", () => {
    const older: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph" },
        sixRowMainTable(),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Auxiliary Equipment: " }],
        },
        auxiliaryTable(),
      ],
    };
    const ensured = ensureVolumetricFormRows(older);
    const [main, auxiliary] = volumetricTables(ensured);
    expect(tableParameters(main)).toEqual(QSR_MAIN_VOLUMETRIC_ROWS.map((row) => row[1]));
    expect(tableParameters(auxiliary)).toEqual(
      QSR_AUXILIARY_VOLUMETRIC_ROWS.map((row) => row[1])
    );
    expect(ensureVolumetricFormRows(ensured)).toBe(ensured);
  });

  it("adds only the missing extra row when Inner Surface area is already present", () => {
    const main = sixRowMainTable();
    main.content?.push({
      type: "tableRow",
      content: QSR_VOLUMETRIC_HEADERS.map((_, i) => ({
        type: "tableCell",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: ["7", "Inner Surface area", ""][i] ?? "" }],
          },
        ],
      })),
    });
    const ensured = ensureVolumetricFormRows({
      type: "doc",
      content: [main],
    });
    expect(tableParameters(volumetricTables(ensured)[0])).toEqual([
      ...QSR_MAIN_VOLUMETRIC_ROWS.slice(0, 6).map((row) => row[1]),
      "Inner Surface area",
      "Equipment Dimensions (L x W x H)",
    ]);
  });

  it("lands the extra rows when an existing report is merged", () => {
    const merged = qualificationSummaryReportDefinition.mergeSection(
      "qsr_volumetric_details",
      {
        narrative: {
          type: "doc",
          content: [sixRowMainTable(), auxiliaryTable()],
        },
      }
    ) as { narrative: JSONContent };
    const [main, auxiliary] = volumetricTables(merged.narrative);
    expect(tableParameters(main)).toContain("Inner Surface area");
    expect(tableParameters(main)).toContain("Equipment Dimensions (L x W x H)");
    expect(tableParameters(auxiliary)).not.toContain("Inner Surface area");
  });
});
