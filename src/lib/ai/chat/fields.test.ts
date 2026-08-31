import { describe, expect, it } from "vitest";
import { documentTypeEnum } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import {
  DV_TRACEABILITY_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";
import {
  listFieldTables,
  sectionHasTable,
  sectionLabel,
  sectionFieldForChat,
} from "./fields";

describe("sectionLabel", () => {
  it("uses registry titles for mechanical DV and QRA history", () => {
    expect(sectionLabel("revision_history")).toBe("Revision History");
    expect(sectionLabel("qra_revision_history")).toBe("Revision History");
    expect(sectionLabel("purpose_scope")).toBe("Purpose & Scope");
  });

  it("never returns an underscore for a registered section", () => {
    for (const type of documentTypeEnum.enumValues) {
      for (const section of getDocumentType(type).sections) {
        expect(sectionLabel(section.key), `${type}:${section.key}`).not.toContain(
          "_"
        );
      }
    }
  });
});

describe("sectionFieldForChat", () => {
  it("exposes tables[] with tableIndex and headers", () => {
    const chat = sectionFieldForChat(
      {
        narrative: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "VCS scheme:" }],
            },
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: ["Component", "Description"].map((text) => ({
                    type: "tableHeader",
                    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                  })),
                },
                {
                  type: "tableRow",
                  content: ["mm", "Major release number"].map((text) => ({
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                  })),
                },
              ],
            },
          ],
        },
      },
      "define",
      "narrative",
      []
    );
    expect(chat.tables).toEqual([
      {
        tableIndex: 0,
        headers: ["Component", "Description"],
        dataRowCount: 1,
      },
    ]);
    expect(chat.structuredText).toContain("tableIndex=0");
    expect(chat.structuredText).toContain("[1,0] mm");
  });
});

describe("listFieldTables", () => {
  it("reads the live demo traceability headers from the section", () => {
    expect(
      listFieldTables(
        { table: seededTableDoc(DV_TRACEABILITY_HEADERS) },
        "traceability",
        "table"
      )
    ).toEqual([
      {
        tableIndex: 0,
        headers: [...DV_TRACEABILITY_HEADERS],
        dataRowCount: 1,
      },
    ]);
    expect(
      sectionHasTable(
        { table: seededTableDoc(DV_TRACEABILITY_HEADERS) },
        "traceability"
      )
    ).toBe(true);
    expect(sectionHasTable({ narrative: { type: "doc", content: [] } }, "define")).toBe(
      false
    );
  });
});
