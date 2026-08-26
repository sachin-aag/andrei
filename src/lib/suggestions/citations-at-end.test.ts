import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  citationAppendPart,
  documentCitationRule,
  extractCitationBrackets,
  isCitationOnlyText,
  keepEmptyParagraphBeforeCitationHeading,
  listParkedCitationsFromDoc,
  moveCitationsToEndOfText,
  normalizeTrailingCitationBlockInText,
  prepareEditForCitationMode,
  splitEditForCitationsAtEnd,
  stripCitationsFromTableOperation,
  stripCitationsFromText,
  stripTrailingCitationBlockFromDoc,
  stripTrailingCitationBlockFromText,
  stripTrailingCitationsFromContent,
} from "./citations-at-end";

describe("stripCitationsFromText", () => {
  it("pulls page and filename citations out of mid-sentence inserts", () => {
    expect(
      stripCitationsFromText(" The test met spec [protocol.pdf, p. 3].")
    ).toEqual({
      prose: " The test met spec.",
      citations: ["[protocol.pdf, p. 3]"],
    });
  });

  it("leaves placeholders and ordinary brackets alone", () => {
    expect(stripCitationsFromText("Use [batch number] from the COA.")).toEqual({
      prose: "Use [batch number] from the COA.",
      citations: [],
    });
  });

  it("leaves numeric citation markers in the prose", () => {
    expect(stripCitationsFromText("The test met spec [1].")).toEqual({
      prose: "The test met spec [1].",
      citations: [],
    });
  });

  it("treats a citation-only insert as empty prose", () => {
    expect(stripCitationsFromText("[results.xlsx, p. 1]")).toEqual({
      prose: "",
      citations: ["[results.xlsx, p. 1]"],
    });
    expect(isCitationOnlyText("[results.xlsx, p. 1]\n[protocol.pdf, p. 2]")).toBe(
      true
    );
    expect(isCitationOnlyText("1. [results.xlsx, p. 1]")).toBe(true);
    expect(isCitationOnlyText("[1]")).toBe(false);
  });
});

describe("moveCitationsToEndOfText", () => {
  it("moves inline citations after the prose and any table, leaving numbered markers", () => {
    const markdown = [
      "Power output met the acceptance limit [protocol.pdf, p. 2].",
      "",
      "| Req | P/F |",
      "| --- | --- |",
      "| R-1 | Pass [datasheet.pdf, p. 4] |",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      [
        "Power output met the acceptance limit [1].",
        "",
        "| Req | P/F |",
        "| --- | --- |",
        "| R-1 | Pass [2] |",
        "",
        "Citations:",
        "1. [protocol.pdf, p. 2]",
        "2. [datasheet.pdf, p. 4]",
      ].join("\n")
    );
  });

  it("reuses an existing list number instead of duplicating the source", () => {
    const markdown = [
      "Outcome is Pass [protocol.pdf, p. 2].",
      "",
      "Citations:",
      "[protocol.pdf, p. 2]",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      [
        "Outcome is Pass [1].",
        "",
        "Citations:",
        "1. [protocol.pdf, p. 2]",
      ].join("\n")
    );
  });

  it("rewrites a bare trailing cite list under a numbered Citations heading", () => {
    const markdown = [
      "Outcome is Pass [protocol.pdf, p. 2].",
      "",
      "[protocol.pdf, p. 2]",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      [
        "Outcome is Pass [1].",
        "",
        "Citations:",
        "1. [protocol.pdf, p. 2]",
      ].join("\n")
    );
  });

  it("emits adjacent markers for multiple sources on one claim", () => {
    expect(
      moveCitationsToEndOfText(
        "Met spec [protocol.pdf, p. 2] [datasheet.pdf, p. 4]."
      )
    ).toBe(
      [
        "Met spec [1][2].",
        "",
        "Citations:",
        "1. [protocol.pdf, p. 2]",
        "2. [datasheet.pdf, p. 4]",
      ].join("\n")
    );
  });
});

describe("splitEditForCitationsAtEnd", () => {
  it("splits a body insert plus citation into a marker and a numbered list", () => {
    expect(
      splitEditForCitationsAtEnd({
        anchorText: "output power was acceptable",
        deleteText: "",
        insertText: " at 9.8 W [protocol.pdf, p. 3]",
      })
    ).toEqual({
      anchorText: "output power was acceptable",
      deleteText: "",
      insertText: " at 9.8 W [1]",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n1. [protocol.pdf, p. 3]",
      },
    });
  });

  it("keeps a scoped cell edit marker and appends the numbered citation", () => {
    const split = splitEditForCitationsAtEnd({
      anchorText: "",
      deleteText: "Pass",
      insertText: "Pass — see protocol [protocol.pdf, p. 1]",
      scope: { kind: "cell", row: 2, col: 3 },
    });
    expect(split.scope).toEqual({ kind: "cell", row: 2, col: 3 });
    expect(split.insertText).toBe("Pass — see protocol [1]");
    expect(split.second).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "Citations:\n1. [protocol.pdf, p. 1]",
    });
  });

  it("keeps a citation-only insert as a marker at the claim", () => {
    expect(
      splitEditForCitationsAtEnd({
        anchorText: "the requirement is met",
        deleteText: "",
        insertText: " [protocol.pdf, p. 2]",
      })
    ).toEqual({
      anchorText: "the requirement is met",
      deleteText: "",
      insertText: " [1]",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n1. [protocol.pdf, p. 2]",
      },
    });
  });

  it("reuses the next number when the field already has a Citations list", () => {
    expect(
      splitEditForCitationsAtEnd(
        {
          anchorText: "the requirement is met",
          deleteText: "",
          insertText: " for configuration B [datasheet.pdf, p. 4]",
        },
        {
          existingFieldText: [
            "Existing note",
            "",
            "Citations:",
            "[protocol.pdf, p. 2]",
          ].join("\n"),
        }
      )
    ).toEqual({
      anchorText: "the requirement is met",
      deleteText: "",
      insertText: " for configuration B [2]",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "2. [datasheet.pdf, p. 4]",
      },
    });
  });

  it("attaches markers when the model still uses a split second part", () => {
    expect(
      splitEditForCitationsAtEnd({
        anchorText: "output power was acceptable",
        deleteText: "",
        insertText: " at 9.8 W",
        second: {
          anchorText: "",
          deleteText: "",
          insertText: "Citations:\n[protocol.pdf, p. 3]",
        },
      })
    ).toEqual({
      anchorText: "output power was acceptable",
      deleteText: "",
      insertText: " at 9.8 W [1]",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n1. [protocol.pdf, p. 3]",
      },
    });
  });

  it("reuses an existing list number at a new claim without appending again", () => {
    expect(
      splitEditForCitationsAtEnd(
        {
          anchorText: "the requirement is met",
          deleteText: "",
          insertText: " for configuration A [protocol.pdf, p. 2]",
        },
        {
          existingFieldText: [
            "Existing note",
            "",
            "Citations:",
            "1. [protocol.pdf, p. 2]",
          ].join("\n"),
        }
      )
    ).toEqual({
      anchorText: "the requirement is met",
      deleteText: "",
      insertText: " for configuration A [1]",
    });
  });
});

describe("prepareEditForCitationMode", () => {
  const split = {
    anchorText: "met spec",
    deleteText: "",
    insertText: " at 9.8 W [protocol.pdf, p. 3]",
    second: {
      anchorText: "",
      deleteText: "",
      insertText: "[protocol.pdf, p. 3]",
    },
  };

  it("drops a second part when the mode is off", () => {
    expect(
      prepareEditForCitationMode(split, { citationsAtEndOfSection: false })
    ).toEqual({
      anchorText: "met spec",
      deleteText: "",
      insertText: " at 9.8 W [protocol.pdf, p. 3]",
    });
  });

  it("splits when the mode is on", () => {
    expect(
      prepareEditForCitationMode(
        {
          anchorText: "met spec",
          deleteText: "",
          insertText: " at 9.8 W [protocol.pdf, p. 3]",
        },
        { citationsAtEndOfSection: true }
      )
    ).toEqual({
      anchorText: "met spec",
      deleteText: "",
      insertText: " at 9.8 W [1]",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n1. [protocol.pdf, p. 3]",
      },
    });
  });
});

describe("documentCitationRule", () => {
  it("asks for inline cites when the mode is off and end-of-section when on", () => {
    expect(documentCitationRule(false)).toContain("in prose");
    expect(documentCitationRule(false)).not.toContain("end of the section");
    expect(documentCitationRule(true)).toContain("end of the section field");
    expect(documentCitationRule(true)).toContain("Citations:");
    expect(documentCitationRule(true)).toContain("split edit");
  });
});

describe("stripCitationsFromTableOperation", () => {
  it("puts numbered markers in edited cells and returns an append part", () => {
    const { operation, citations } = stripCitationsFromTableOperation({
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        {
          row: 1,
          col: 2,
          expectedText: "Pass",
          insertText: "Pass [protocol.pdf, p. 3]",
        },
      ],
    });
    expect(citations).toEqual(["[protocol.pdf, p. 3]"]);
    expect(operation.kind).toBe("edit_cells");
    if (operation.kind !== "edit_cells") return;
    expect(operation.cells[0]?.insertText).toBe("Pass [1]");
    expect(citationAppendPart(citations, "Existing prose")).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "Citations:\n1. [protocol.pdf, p. 3]",
    });
    expect(
      citationAppendPart(
        citations,
        ["Existing prose", "", "Citations:", "[other.pdf, p. 1]"].join("\n")
      )
    ).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "2. [protocol.pdf, p. 3]",
    });
    expect(
      citationAppendPart(
        citations,
        ["Already listed", "", "Citations:", "[protocol.pdf, p. 3]"].join("\n")
      )
    ).toBeUndefined();
  });
});

describe("keepEmptyParagraphBeforeCitationHeading", () => {
  it("keeps only an empty spacer immediately before Citations:", () => {
    expect(
      keepEmptyParagraphBeforeCitationHeading(
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        }
      )
    ).toBe(true);
    expect(
      keepEmptyParagraphBeforeCitationHeading(
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body copy." }],
        }
      )
    ).toBe(false);
  });
});

describe("extractCitationBrackets", () => {
  it("dedupes repeated source cites and ignores numeric markers", () => {
    expect(
      extractCitationBrackets("[a.pdf, p. 1] and again [a.pdf, p. 1] [1]")
    ).toEqual(["[a.pdf, p. 1]"]);
  });
});

describe("normalizeTrailingCitationBlockInText", () => {
  it("numbers a legacy unnumbered list without inventing body markers", () => {
    expect(
      normalizeTrailingCitationBlockInText(
        "Verify REQ-101.\n\nCitations:\n[protocol.pdf, p. 3]"
      )
    ).toBe("Verify REQ-101.\n\nCitations:\n1. [protocol.pdf, p. 3]");
  });
});

describe("stripTrailingCitationBlockFromText", () => {
  it("drops a trailing Citations: list, numbered markers, and keeps the body", () => {
    expect(
      stripTrailingCitationBlockFromText(
        "Verify REQ-101 [1].\n\nCitations:\n1. [protocol.pdf, p. 3]\n2. [results.xlsx, p. 1]"
      )
    ).toBe("Verify REQ-101.");
  });

  it("leaves body-only text unchanged", () => {
    expect(stripTrailingCitationBlockFromText("Verify REQ-101.")).toBe(
      "Verify REQ-101."
    );
  });

  it("does not strip numeric brackets that are not in the citation list", () => {
    expect(
      stripTrailingCitationBlockFromText(
        "See SOP [12] and the result [1].\n\nCitations:\n1. [protocol.pdf, p. 3]"
      )
    ).toBe("See SOP [12] and the result.");
  });
});

describe("stripTrailingCitationBlockFromDoc", () => {
  function paragraph(text?: string): JSONContent {
    return text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" };
  }

  it("drops the spacer, heading, and citation lines after a table", () => {
    const table: JSONContent = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [paragraph("REQ-101")],
            },
          ],
        },
      ],
    };
    const stripped = stripTrailingCitationBlockFromDoc({
      type: "doc",
      content: [
        table,
        paragraph(),
        paragraph("Citations:"),
        paragraph("[protocol.pdf, p. 3]"),
      ],
    });
    expect(stripped.content).toEqual([table]);
  });

  it("strips matching numbered markers from table cells", () => {
    const stripped = stripTrailingCitationBlockFromDoc({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [paragraph("Pass [1]")],
                },
              ],
            },
          ],
        },
        paragraph(),
        paragraph("Citations:"),
        paragraph("1. [protocol.pdf, p. 3]"),
      ],
    });
    expect(stripped.content).toEqual([
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [paragraph("Pass")],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("does not strip inline body text that is not a trailing block", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [paragraph("The output met spec [protocol.pdf, p. 3].")],
    };
    expect(stripTrailingCitationBlockFromDoc(doc)).toEqual(doc);
  });
});

describe("stripTrailingCitationsFromContent", () => {
  it("strips each TipTap field in a section object", () => {
    const result = stripTrailingCitationsFromContent({
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Verify REQ-101 [1]." }],
          },
          { type: "paragraph" },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Citations:" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "1. [protocol.pdf, p. 3]" }],
          },
        ],
      },
      table: { type: "doc", content: [{ type: "paragraph" }] },
    }) as { narrative: JSONContent; table: JSONContent };

    expect(result.narrative.content).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Verify REQ-101." }],
      },
    ]);
    expect(result.table).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

describe("listParkedCitationsFromDoc", () => {
  function paragraph(text?: string): JSONContent {
    return text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" };
  }

  it("reads numbered sources from the trailing Citations block", () => {
    expect(
      listParkedCitationsFromDoc({
        type: "doc",
        content: [
          paragraph("Output met spec [1]."),
          paragraph(),
          paragraph("Citations:"),
          paragraph("1. [protocol.pdf, p. 3]"),
          paragraph("2. [results.xlsx, p. 1]"),
        ],
      })
    ).toEqual([
      { number: 1, source: "[protocol.pdf, p. 3]" },
      { number: 2, source: "[results.xlsx, p. 1]" },
    ]);
  });

  it("is empty when the field has no parked list", () => {
    expect(
      listParkedCitationsFromDoc({
        type: "doc",
        content: [paragraph("No citations yet.")],
      })
    ).toEqual([]);
  });
});
