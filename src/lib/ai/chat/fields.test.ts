import { describe, expect, it } from "vitest";
import { documentTypeEnum } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import {
  DV_TRACEABILITY_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";
import {
  MECHANICAL_RESULTS_HEADERS,
} from "@/lib/document-types/mechanical/sections";
import {
  ELR_CALIBRATION_HEADERS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";
import {
  chatEditableSections,
  isChatEditableSection,
  listFieldTables,
  fieldFillState,
  sectionFillState,
  sectionHasTable,
  sectionLabel,
  sectionFieldForChat,
} from "./fields";

describe("chatEditableSections", () => {
  it("omits ELR Attachments because Word export fills that table", () => {
    const editable = chatEditableSections("equipment_lifecycle_report");
    expect(editable).not.toContain("elr_attachments");
    expect(editable).toContain("elr_objective");
    expect(isChatEditableSection("elr_attachments", "equipment_lifecycle_report")).toBe(
      false
    );
  });
});

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

describe("fieldFillState seeded tables", () => {
  it("treats a header-only seeded table as empty, not partial", () => {
    const content = { table: seededTableDoc(DV_TRACEABILITY_HEADERS) };
    expect(fieldFillState(content, "traceability", "table")).toBe("empty");
    expect(sectionFillState(content, "traceability")).toBe("empty");
    expect(sectionHasTable(content, "traceability")).toBe(true);
  });

  it("treats seeded mechanical results tables as empty", () => {
    const content = {
      hardwareTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
      systemTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
    };
    expect(fieldFillState(content, "requirements_verified", "hardwareTable")).toBe(
      "empty"
    );
    expect(fieldFillState(content, "requirements_verified", "systemTable")).toBe(
      "empty"
    );
    expect(sectionFillState(content, "requirements_verified")).toBe("empty");
    expect(sectionHasTable(content, "requirements_verified")).toBe(true);
  });

  it("keeps a table with filled data cells as filled", () => {
    const content = {
      table: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: ["Req ID", "Result"].map((text) => ({
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })),
              },
              {
                type: "tableRow",
                content: ["M3-SYS-FN-037", "Pass"].map((text) => ({
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })),
              },
            ],
          },
        ],
      },
    };
    expect(fieldFillState(content, "traceability", "table")).not.toBe("empty");
    expect(sectionFillState(content, "traceability")).not.toBe("empty");
  });
});

describe("ELR sectionFillState", () => {
  const filledCalibrationTable = {
    type: "doc" as const,
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: ELR_CALIBRATION_HEADERS.map((text) => ({
              type: "tableHeader" as const,
              content: [
                { type: "paragraph", content: [{ type: "text", text }] },
              ],
            })),
          },
          {
            type: "tableRow",
            content: ELR_CALIBRATION_HEADERS.map((_, index) => ({
              type: "tableCell" as const,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: index === 0 ? "E/PR/070/PG 1-01" : "ok",
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
  };

  it("keeps a table-only evidence section partial until the assessment has a count", () => {
    const tableOnly = {
      ...EMPTY_ELR_CONTENT.elr_calibration,
      table: filledCalibrationTable,
    };
    expect(fieldFillState(tableOnly, "elr_calibration", "table")).not.toBe("empty");
    expect(sectionFillState(tableOnly, "elr_calibration")).toBe("partial");
  });

  it("is filled when the table has rows and the assessment states a count", () => {
    const assessed = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "18 of 18 instruments were within tolerance this period; the qualified state still holds and no runtime was lost. [[table]]",
              },
            ],
          },
        ],
      },
      table: filledCalibrationTable,
    };
    expect(sectionFillState(assessed, "elr_calibration")).toBe("filled");
  });

  it("treats a 5.1 table that only has seeded section numbers as empty", () => {
    const content = EMPTY_ELR_CONTENT.elr_system_trends;
    expect(fieldFillState(content, "elr_system_trends", "table")).toBe("empty");
    expect(sectionFillState(content, "elr_system_trends")).toBe("empty");
    expect(sectionHasTable(content, "elr_system_trends")).toBe(true);
  });
});
