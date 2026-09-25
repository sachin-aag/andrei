import type { JSONContent } from "@tiptap/core";
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
  emptyQsrContent,
  QSR_RTM_HEADERS,
} from "@/lib/document-types/qsr/sections";
import { EMPTY_VQ_CONTENT } from "@/lib/document-types/vq/sections";
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

  it("treats the QSR process-requirements template as empty", () => {
    const content = emptyQsrContent("qsr_rtm_process");
    expect(fieldFillState(content, "qsr_rtm_process", "table")).toBe("empty");
    expect(sectionFillState(content, "qsr_rtm_process")).toBe("empty");
    expect(sectionHasTable(content, "qsr_rtm_process")).toBe(true);
  });

  it("treats a fresh VQ matrix template as empty", () => {
    const content = EMPTY_VQ_CONTENT.vq_section_g;
    expect(fieldFillState(content, "vq_section_g", "table")).toBe("empty");
    expect(sectionFillState(content, "vq_section_g")).toBe("empty");
  });

  it("treats the QSR template plus one real row as filled", () => {
    const content = structuredClone(emptyQsrContent("qsr_rtm_process")) as {
      table: { content?: Array<{ content?: unknown[] }> };
    };
    const table = content.table.content?.[0] as { content: unknown[] };
    table.content.push({
      type: "tableRow",
      content: QSR_RTM_HEADERS.map((_, index) => ({
        type: "tableCell",
        content: [
          {
            type: "paragraph",
            content:
              index === 0 ? [{ type: "text", text: "URS-2" }] : [],
          },
        ],
      })),
    });
    expect(fieldFillState(content, "qsr_rtm_process", "table")).not.toBe("empty");
    expect(sectionFillState(content, "qsr_rtm_process")).not.toBe("empty");
  });

  it("treats QSR volumetric / operating-range / other-details templates as empty", () => {
    expect(
      sectionFillState(
        emptyQsrContent("qsr_volumetric_details"),
        "qsr_volumetric_details"
      )
    ).toBe("empty");
    expect(
      sectionFillState(emptyQsrContent("qsr_operating_range"), "qsr_operating_range")
    ).toBe("empty");
    expect(
      sectionFillState(emptyQsrContent("qsr_other_details"), "qsr_other_details")
    ).toBe("empty");
  });

  it("keeps the canned QSR scope paragraph filled", () => {
    expect(sectionFillState(emptyQsrContent("qsr_scope"), "qsr_scope")).toBe(
      "filled"
    );
  });

  it("treats QSR volumetric details as filled once a Details cell is written", () => {
    const content = structuredClone(emptyQsrContent("qsr_volumetric_details")) as {
      narrative: JSONContent;
    };
    const table = content.narrative.content?.find((node) => node.type === "table");
    const detailsCell = table?.content?.[1]?.content?.[2];
    expect(detailsCell).toBeTruthy();
    if (!detailsCell) return;
    detailsCell.content = [
      { type: "paragraph", content: [{ type: "text", text: "120" }] },
    ];
    expect(sectionFillState(content, "qsr_volumetric_details")).not.toBe("empty");
  });

  it("treats QSR other details as filled once the agitator type is named", () => {
    const content = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Agitator Type: ", marks: [{ type: "bold" }] },
              { type: "text", text: "Pitched blade" },
            ],
          },
        ],
      },
    };
    expect(sectionFillState(content, "qsr_other_details")).not.toBe("empty");
  });

  it("does not treat seed text moved to another cell as still empty", () => {
    const content = structuredClone(emptyQsrContent("qsr_rtm_process")) as {
      table: JSONContent;
    };
    const table = content.table.content?.[0];
    const ursRow = table?.content?.[1];
    const blankRow = table?.content?.[3];
    const sourceCell = ursRow?.content?.[0];
    const destCell = blankRow?.content?.[0];
    expect(sourceCell && destCell).toBeTruthy();
    if (!sourceCell || !destCell) return;
    destCell.content = sourceCell.content;
    sourceCell.content = [{ type: "paragraph" }];
    expect(fieldFillState(content, "qsr_rtm_process", "table")).not.toBe("empty");
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
