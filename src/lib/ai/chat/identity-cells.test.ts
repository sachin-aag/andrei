import { describe, expect, it } from "vitest";
import { emptyQsrContent } from "@/lib/document-types/qsr/sections";
import {
  isIdentityValueHeader,
  tableHasEmptyIdentityValueCells,
} from "./identity-cells";

function cell(
  type: "tableHeader" | "tableCell",
  text: string
) {
  return {
    type,
    content: [
      {
        type: "paragraph" as const,
        content: text ? [{ type: "text" as const, text }] : [],
      },
    ],
  };
}

function tableDoc(headers: string[], rows: string[][]) {
  return {
    type: "doc" as const,
    content: [
      {
        type: "table" as const,
        content: [
          {
            type: "tableRow" as const,
            content: headers.map((header) => cell("tableHeader", header)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: row.map((text) => cell("tableCell", text)),
          })),
        ],
      },
    ],
  };
}

describe("isIdentityValueHeader", () => {
  it("matches document / SOP / reference number columns", () => {
    expect(isIdentityValueHeader("Reference Number")).toBe(true);
    expect(isIdentityValueHeader("SOP Number")).toBe(true);
    expect(isIdentityValueHeader("Document Number")).toBe(true);
    expect(isIdentityValueHeader("Protocol No.")).toBe(true);
    expect(isIdentityValueHeader("Report Number")).toBe(true);
  });

  it("does not match name or RTM stage columns", () => {
    expect(isIdentityValueHeader("Name of the Document")).toBe(false);
    expect(isIdentityValueHeader("SOP Name")).toBe(false);
    expect(isIdentityValueHeader("Reference – Qualification Stage")).toBe(
      false
    );
    expect(isIdentityValueHeader("Remarks")).toBe(false);
  });
});

describe("tableHasEmptyIdentityValueCells", () => {
  it("is true for the seeded QSR 1.3 References table", () => {
    const seeded = emptyQsrContent("qsr_references");
    expect("table" in seeded).toBe(true);
    if (!("table" in seeded)) return;
    expect(tableHasEmptyIdentityValueCells(seeded.table)).toBe(true);
  });

  it("is true when named rows still lack a reference number", () => {
    expect(
      tableHasEmptyIdentityValueCells(
        tableDoc(
          ["Name of the Document", "Reference Number"],
          [
            ["User Requirement Specification", "URS/GLR-1301"],
            ["Purchase Order (P.O)", ""],
            ["Design Specification / Data Sheet Document", ""],
          ]
        )
      )
    ).toBe(true);
  });

  it("is false when every named row has an identifier", () => {
    expect(
      tableHasEmptyIdentityValueCells(
        tableDoc(
          ["Name of the Document", "Reference Number"],
          [
            ["User Requirement Specification", "URS/GLR-1301"],
            ["Purchase Order (P.O)", "45001234"],
          ]
        )
      )
    ).toBe(false);
  });

  it("ignores tables without an identity-number column", () => {
    expect(
      tableHasEmptyIdentityValueCells(
        tableDoc(
          ["URS ID", "Parameters", "Remarks"],
          [["URS-1", "Capacity", ""]]
        )
      )
    ).toBe(false);
  });
});
