import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  appendFootnotesToTableDoc,
  applyMechanicalResultsColWidths,
  paragraphPlainText,
  placeRequirementsVerifiedFootnotes,
  placeUutTableFootnotes,
  sectionHasPrototypeFootnote,
  splitTableFootnotes,
  tableHasQualifiedVerdict,
} from "./mechanical-table-footnotes";

function para(text: string, italic = false): JSONContent {
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text,
        ...(italic ? { marks: [{ type: "italic" }] } : {}),
      },
    ],
  };
}

function tableDoc(rows: readonly (readonly string[])[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((cells, rowIndex) => ({
          type: "tableRow",
          content: cells.map((text) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          })),
        })),
      },
    ],
  };
}

describe("splitTableFootnotes", () => {
  it("peels a stray i and an italic Deviation footnote out of the 4.2 lead-in", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        para(
          "All requirements detailed in the Solea M3 Perioguide System & Hardware Test Plan were verified. See the tables below for a summary of results."
        ),
        para("i", true),
        para(
          "See Deviation #02, deemed Not Applicable to the current testing execution",
          true
        ),
      ],
    };
    const { body, footnotes } = splitTableFootnotes(doc, "results");
    expect(paragraphPlainText(body.content![0]!)).toContain("See the tables below");
    expect(body.content).toHaveLength(1);
    expect(footnotes).toHaveLength(1);
    expect(paragraphPlainText(footnotes[0]!)).toContain("Deviation #02");
  });

  it("peels a wrapped-asterisk prototype footnote from 2.3 narrative", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        para("Six (6) Solea systems were required to complete testing."),
        para(
          "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6*"
        ),
      ],
    };
    const { body, footnotes } = splitTableFootnotes(doc, "prototype");
    expect(body.content).toHaveLength(1);
    expect(paragraphPlainText(footnotes[0]!)).toContain("functionally equivalent");
    expect(paragraphPlainText(footnotes[0]!)).toMatch(/^\*/);
  });
});

describe("placeRequirementsVerifiedFootnotes", () => {
  const hardware = tableDoc([
    ["Req ID", "Requirement Description", "Notes/Results", "Pass/Fail"],
    [
      "M3-HRS-BD-011",
      "Power shall not drop 20%.",
      "Not Applicable / Refer to Deviation #2",
      "Pass*",
    ],
  ]);
  const system = tableDoc([
    ["Req ID", "Requirement Description", "Notes/Results", "Pass/Fail"],
    ["M3-SYS-FN-037", "Tip detach torque.", "See data sheets in Appendix A.", "Pass"],
  ]);

  it("moves the Deviation footnote under the hardware table that has Pass*", () => {
    const placed = placeRequirementsVerifiedFootnotes({
      narrative: {
        type: "doc",
        content: [
          para("See the tables below for a summary of results."),
          para("i"),
          para(
            "See Deviation #02, deemed Not Applicable to the current testing execution",
            true
          ),
        ],
      },
      hardwareTable: hardware,
      systemTable: system,
    });
    expect(richLeadIn(placed.leadIn)).toContain("See the tables below");
    expect(richLeadIn(placed.leadIn)).not.toContain("Deviation #02");
    expect(richLeadIn(placed.leadIn)).not.toMatch(/\bi\b/);
    expect(richLeadIn(placed.hardwareTable)).toContain("M3-HRS-BD-011");
    expect(richLeadIn(placed.hardwareTable)).toContain("Deviation #02");
    expect(richLeadIn(placed.systemTable)).not.toContain("Deviation #02");
  });

  it("does not duplicate a footnote already after the table", () => {
    const hardwareWithNote = appendFootnotesToTableDoc(
      hardware,
      [para("*See Deviation #02, deemed Not Applicable to the current testing execution*")],
      "results"
    );
    const placed = placeRequirementsVerifiedFootnotes({
      narrative: {
        type: "doc",
        content: [
          para("See the tables below."),
          para("*See Deviation #02, deemed Not Applicable to the current testing execution*"),
        ],
      },
      hardwareTable: hardwareWithNote,
      systemTable: system,
    });
    const matches = richLeadIn(placed.hardwareTable).match(/Deviation #02/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("placeUutTableFootnotes", () => {
  it("moves the prototype footnote under the UUT table", () => {
    const placed = placeUutTableFootnotes({
      narrative: {
        type: "doc",
        content: [
          para("Eight (8) unique UUT's."),
          para(
            "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6"
          ),
        ],
      },
      table: tableDoc([
        ["Equipment", "Manufacturer", "Part Number", "Serial Number", "Revision"],
        ["CO2 Sensor Handpiece Adapter", "Convergent Dental", "SUB-00468", "N/A", "2*"],
      ]),
    });
    expect(richLeadIn(placed.narrative)).toContain("unique UUT");
    expect(richLeadIn(placed.narrative)).not.toContain("functionally equivalent");
    expect(richLeadIn(placed.table)).toContain("SUB-00468");
    expect(richLeadIn(placed.table)).toContain("functionally equivalent");
  });
});

describe("sectionHasPrototypeFootnote", () => {
  it("counts a footnote after the table, not a star only in a revision cell", () => {
    const tableOnlyStar = tableDoc([
      ["Equipment", "Manufacturer", "Part Number", "Serial Number", "Revision"],
      ["CO2 Sensor Handpiece Adapter", "Convergent Dental", "SUB-00468", "N/A", "2*"],
    ]);
    expect(
      sectionHasPrototypeFootnote(
        { type: "doc", content: [para("Eight unique UUT's.")] },
        tableOnlyStar
      )
    ).toBe(false);
    expect(
      sectionHasPrototypeFootnote(
        { type: "doc", content: [para("Eight unique UUT's.")] },
        appendFootnotesToTableDoc(
          tableOnlyStar,
          [
            para(
              "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6"
            ),
          ],
          "prototype"
        )
      )
    ).toBe(true);
  });
});

describe("tableHasQualifiedVerdict", () => {
  it("detects a trailing asterisk on Pass/Fail", () => {
    expect(
      tableHasQualifiedVerdict(
        tableDoc([
          ["Req ID", "Requirement Description", "Notes/Results", "Pass/Fail"],
          ["M3-HRS-BD-011", "Power.", "N/A", "Pass*"],
        ])
      )
    ).toBe(true);
    expect(
      tableHasQualifiedVerdict(
        tableDoc([
          ["Req ID", "Requirement Description", "Notes/Results", "Pass/Fail"],
          ["M3-SYS-FN-037", "Torque.", "See data sheets.", "Pass"],
        ])
      )
    ).toBe(false);
  });
});

describe("applyMechanicalResultsColWidths", () => {
  it("sets four landscape shares that sum to the grid max", () => {
    const doc = applyMechanicalResultsColWidths(
      tableDoc([
        ["Req ID", "Requirement Description", "Notes/Results", "Pass/Fail"],
        ["M3-HRS-GN-001", "RoHS.", "Pass", "Pass"],
      ]),
      14000
    );
    const table = doc.content?.find((n) => n.type === "table");
    expect(table?.attrs?.colWidths).toEqual([2240, 5880, 3920, 1960]);
  });
});

function richLeadIn(doc: JSONContent): string {
  return JSON.stringify(doc);
}
