import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { applyCvpEquipmentTypeRecipe } from "./equipment-upgrade";
import { normalizeCvpEquipmentSamplingContent } from "./equipment-sampling";
import { cvpCleaningParameterRows } from "./equipment-types";
import {
  CVP_CLEANING_OPERATION_INTRO_SEEDS,
  CVP_PREVIOUS_CLEANING_OPERATION_INTRO_SEED,
  CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED,
  CVP_VISUAL_INSPECTION_INTRO_SEED,
  CVP_VISUAL_INSPECTION_ROWS,
  groupedResultsTable,
} from "./sections";

function heading(level: 2 | 3 | 4, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function cell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    content: text
      ? [{ type: "paragraph", content: [{ type: "text", text }] }]
      : [{ type: "paragraph" }],
  };
}

function cellText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(cellText).join("");
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): JSONContent {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: headers.map((label) => cell("tableHeader", label)),
      },
      ...rows.map((row) => ({
        type: "tableRow" as const,
        content: headers.map((_, i) => cell("tableCell", row[i] ?? "")),
      })),
    ],
  };
}

function firstColumns(doc: JSONContent, header: string): string[] {
  const match = (doc.content ?? []).find((node) => {
    if (node.type !== "table") return false;
    const labels = (node.content?.[0]?.content ?? []).map((c) =>
      cellText(c).replace(/\s+/g, " ").trim()
    );
    return labels[0]?.toLowerCase() === header.toLowerCase();
  });
  if (!match?.content) return [];
  const grouped = (match.content[0]?.content ?? []).some(
    (c) => cellText(c).replace(/\s+/g, " ").trim() === "Results"
  );
  const start = grouped ? 2 : 1;
  return match.content.slice(start).flatMap((row) => {
    const text = cellText(row.content?.[0]).replace(/\s+/g, " ").trim();
    return text ? [text] : [];
  });
}

function headings(doc: JSONContent): string[] {
  return (doc.content ?? [])
    .filter((node) => node.type === "heading")
    .map((node) =>
      (node.content ?? []).map((child) => child.text ?? "").join("")
    );
}

function paragraphs(doc: JSONContent): string[] {
  return (doc.content ?? [])
    .filter((node) => node.type === "paragraph")
    .map((node) => cellText(node).replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0);
}

function legacyGlrBox(): JSONContent {
  return {
    type: "doc",
    content: [
      heading(2, "15.1 Glass Lined Reactor (GLR-1205)"),
      heading(3, "15.1.1 Equipment details"),
      table(
        ["Parameter", "Details", "Source"],
        [["Capacity", "10000 L", "CPDR"]]
      ),
      heading(3, "15.1.7 Swab & Rinse samples analysis results summary"),
    ],
  };
}

describe("applyCvpEquipmentTypeRecipe — 15.N.4 / 15.N.6 on-read", () => {
  it("adds typed 15.N.4 rows and 15.N.6 verification rows when identity is already filled", () => {
    const upgraded = applyCvpEquipmentTypeRecipe(legacyGlrBox());
    const text = JSON.stringify(upgraded);
    expect(text).toContain("10000 L");
    expect(headings(upgraded)).toContain(
      "15.1.4 Cleaning operation results summary"
    );
    expect(headings(upgraded)).toContain("15.1.6 Visual inspection summary");
    expect(firstColumns(upgraded, "Cleaning Parameter")).toEqual(
      cvpCleaningParameterRows("reactor").map(([parameter]) => parameter)
    );
    expect(firstColumns(upgraded, "Sample description / location")).toEqual(
      CVP_VISUAL_INSPECTION_ROWS.map((row) => row[0])
    );
    expect(text).not.toContain("280");
    expect(text).not.toContain("Visually clean");
    expect(paragraphs(upgraded)).toEqual(
      expect.arrayContaining([...CVP_CLEANING_OPERATION_INTRO_SEEDS])
    );
  });

  it("inserts 15.N.4 by title on an SSR box and bumps collapsed results numbering", () => {
    const collapsed: JSONContent = {
      type: "doc",
      content: [
        heading(2, "15.2 Stainless Steel Reactor (SSR-1302)"),
        heading(3, "15.2.1 Equipment details"),
        table(
          ["Parameter", "Details", "Source"],
          [["Capacity", "8000 L", "CPDR"]]
        ),
        heading(3, "15.2.4 Cleaning validation results summary"),
        heading(3, "15.2.5 Visual inspection summary"),
        {
          type: "paragraph",
          content: [
            { type: "text", text: CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED },
          ],
        },
        groupedResultsTable(
          ["Sample description / location"],
          CVP_VISUAL_INSPECTION_ROWS
        ),
        heading(3, "15.2.6 Swab & Rinse samples analysis results summary"),
      ],
    };
    const upgraded = applyCvpEquipmentTypeRecipe(collapsed);
    expect(headings(upgraded)).toContain(
      "15.2.4 Cleaning operation results summary"
    );
    expect(headings(upgraded)).toContain(
      "15.2.5 Cleaning validation results summary"
    );
    expect(headings(upgraded)).toContain("15.2.6 Visual inspection summary");
    expect(headings(upgraded)).toContain(
      "15.2.7 Reflux, Swab & Rinse samples analysis results summary"
    );
    expect(firstColumns(upgraded, "Cleaning Parameter")).toEqual(
      cvpCleaningParameterRows("reactor").map(([parameter]) => parameter)
    );
    expect(paragraphs(upgraded)).toEqual(
      expect.arrayContaining([...CVP_CLEANING_OPERATION_INTRO_SEEDS])
    );
    expect(JSON.stringify(upgraded)).toContain(CVP_VISUAL_INSPECTION_INTRO_SEED);
    expect(JSON.stringify(upgraded)).not.toContain(
      "independently by the Production Chemist"
    );
    expect(
      (JSON.stringify(upgraded).match(/Production Chemist verification/g) ?? [])
        .length
    ).toBe(1);
    expect(JSON.stringify(upgraded)).toContain("8000 L");
  });

  it("does not add a 15.N.4 cleaning table on a leaf filter", () => {
    const upgraded = applyCvpEquipmentTypeRecipe({
      type: "doc",
      content: [
        heading(2, "15.5 Leaf Filter (LF-1301)"),
        heading(3, "15.5.1 Equipment details"),
        heading(3, "15.5.4 Cleaning validation results summary"),
      ],
    });
    expect(headings(upgraded)).not.toContain(
      "15.5.4 Cleaning operation results summary"
    );
    expect(firstColumns(upgraded, "Cleaning Parameter")).toEqual([]);
    expect(headings(upgraded)).toContain(
      "15.5.5 Cleaning validation results summary"
    );
  });

  it("swaps the short 15.N.4 leftover intro and keeps the typed reactor table", () => {
    const typed = groupedResultsTable(
      ["Cleaning Parameter", "Acceptance Criteria / Target"],
      cvpCleaningParameterRows("reactor").map(([parameter, target]) => [
        parameter,
        target,
        "",
        "",
        "",
      ])
    );
    const upgraded = applyCvpEquipmentTypeRecipe({
      type: "doc",
      content: [
        heading(2, "15.1 Glass Lined Reactor (GLR-1302)"),
        heading(3, "15.1.4 Cleaning operation results summary"),
        {
          type: "paragraph",
          content: [
            { type: "text", text: CVP_PREVIOUS_CLEANING_OPERATION_INTRO_SEED },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The completed cleaning operation is considered satisfactory and the equipment is considered validated.",
            },
          ],
        },
        typed,
      ],
    });
    const text = JSON.stringify(upgraded);
    expect(text).not.toContain("Record cleaning parameters");
    expect(text).not.toContain("considered satisfactory");
    expect(paragraphs(upgraded)).toEqual(
      expect.arrayContaining([...CVP_CLEANING_OPERATION_INTRO_SEEDS])
    );
    expect(firstColumns(upgraded, "Cleaning Parameter")).toEqual(
      cvpCleaningParameterRows("reactor").map(([parameter]) => parameter)
    );
  });

  it("replaces a leftover reactor flushing table on a sparkler with sparkler rows", () => {
    const leftover = groupedResultsTable(
      ["Cleaning Parameter", "Acceptance Criteria / Target"],
      [["Water Quantity Used for flushing (L)", "As per approved cleaning SOP", "", "", ""]]
    );
    const doc: JSONContent = {
      type: "doc",
      content: [
        heading(2, "15.2 Sparkler Filter (SF-1201)"),
        leftover,
      ],
    };
    const upgraded = applyCvpEquipmentTypeRecipe(doc);
    expect(firstColumns(upgraded, "Cleaning Parameter")).toEqual(
      cvpCleaningParameterRows("sparkler").map(([parameter]) => parameter)
    );
    expect(JSON.stringify(upgraded)).toContain(
      "Water Quantity Used for gasket washing (L)"
    );
    expect(JSON.stringify(upgraded)).not.toContain(
      "Water quantity used for reflux"
    );
  });

  it("keeps filled 15.N.4 batch values and custom parameter names", () => {
    const filled = groupedResultsTable(
      ["Cleaning Parameter", "Acceptance Criteria / Target"],
      [["Water Quantity Used for flushing (L)", "As per approved cleaning SOP", "280", "280", "280"]]
    );
    const custom = groupedResultsTable(
      ["Cleaning Parameter", "Acceptance Criteria / Target"],
      [
        ["Site-specific pre-rinse (L)", "NLT 12", "", "", ""],
        ["Site-specific solvent (L)", "", "", "", ""],
      ]
    );
    const filledDoc = applyCvpEquipmentTypeRecipe({
      type: "doc",
      content: [heading(2, "15.1 Glass Lined Reactor (GLR-1205)"), filled],
    });
    expect(JSON.stringify(filledDoc)).toContain("280");
    expect(firstColumns(filledDoc, "Cleaning Parameter")).toEqual([
      "Water Quantity Used for flushing (L)",
    ]);

    const customDoc = applyCvpEquipmentTypeRecipe({
      type: "doc",
      content: [heading(2, "15.2 Sparkler Filter (SF-1201)"), custom],
    });
    expect(firstColumns(customDoc, "Cleaning Parameter")).toEqual([
      "Site-specific pre-rinse (L)",
      "Site-specific solvent (L)",
    ]);
  });

  it("does not graft 15.N.4 / 15.N.6 onto a cleared box", () => {
    const { items } = normalizeCvpEquipmentSamplingContent({
      items: [{ type: "doc", content: [{ type: "paragraph" }] }],
    });
    expect(JSON.stringify(items[0])).not.toContain("Cleaning Parameter");
    expect(JSON.stringify(items[0])).not.toContain("Production Chemist");
    expect(items[0]?.content?.some((node) => node.type === "table")).toBe(false);
  });

  it("runs on-read through normalize for an existing GLR box", () => {
    const { items } = normalizeCvpEquipmentSamplingContent({
      items: [legacyGlrBox()],
    });
    const text = JSON.stringify(items[0]);
    expect(text).toContain("15.1.4 Cleaning operation results summary");
    expect(text).toContain("Water quantity used for reflux (L)");
    expect(text).toContain("Production Chemist verification");
    expect(text).toContain("10k L");
  });

  it("does not duplicate 15.N.6 when the four verification rows are already present", () => {
    const existing: JSONContent = {
      type: "doc",
      content: [
        heading(2, "15.3 Centrifuge (CF-1203)"),
        heading(3, "15.3.6 Visual inspection summary"),
        groupedResultsTable(
          ["Sample description / location"],
          CVP_VISUAL_INSPECTION_ROWS
        ),
      ],
    };
    const upgraded = applyCvpEquipmentTypeRecipe(existing);
    expect(
      (JSON.stringify(upgraded).match(/Production Chemist verification/g) ?? [])
        .length
    ).toBe(1);
    expect(
      (headings(upgraded).filter((text) => text.includes("15.3.6")) ?? []).length
    ).toBe(1);
  });

  it("does not put an Equipment type line back after it is deleted", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        heading(2, "15.2 Stainless Steel Reactor (SSR-1302)"),
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The subject equipment is located in Production Block-2.",
            },
          ],
        },
      ],
    };
    const upgraded = applyCvpEquipmentTypeRecipe(doc);
    const text = JSON.stringify(upgraded);
    expect(text).not.toContain("Equipment type:");
    expect(text).toContain("Production Block-2");

    const withBoth: JSONContent = {
      type: "doc",
      content: [
        heading(2, "15.2 Stainless Steel Reactor (SSR-1302)"),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Equipment type: Glass lined reactor" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Equipment type: Stainless steel reactor" },
          ],
        },
      ],
    };
    const kept = applyCvpEquipmentTypeRecipe(withBoth);
    const withoutGlass: JSONContent = {
      ...kept,
      content: (kept.content ?? []).filter(
        (node) =>
          node.type !== "paragraph" ||
          !JSON.stringify(node).includes("Glass lined reactor")
      ),
    };
    const { items } = normalizeCvpEquipmentSamplingContent({
      items: [withoutGlass],
    });
    const saved = JSON.stringify(items[0]);
    expect(saved).not.toContain("Glass lined reactor");
    expect(saved).toContain("Equipment type: Stainless steel reactor");
    expect(saved.match(/Equipment type:/g)?.length).toBe(1);
  });
});
