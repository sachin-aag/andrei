import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  citationAppendPart,
  documentCitationRule,
  extractCitationBrackets,
  isCitationOnlyText,
  keepEmptyParagraphBeforeCitationHeading,
  moveCitationsToEndOfText,
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

  it("treats a citation-only insert as empty prose", () => {
    expect(stripCitationsFromText("[results.xlsx, p. 1]")).toEqual({
      prose: "",
      citations: ["[results.xlsx, p. 1]"],
    });
    expect(isCitationOnlyText("[results.xlsx, p. 1]\n[protocol.pdf, p. 2]")).toBe(
      true
    );
  });
});

describe("moveCitationsToEndOfText", () => {
  it("moves inline citations after the prose and any table", () => {
    const markdown = [
      "Power output met the acceptance limit [protocol.pdf, p. 2].",
      "",
      "| Req | P/F |",
      "| --- | --- |",
      "| R-1 | Pass [datasheet.pdf, p. 4] |",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      [
        "Power output met the acceptance limit.",
        "",
        "| Req | P/F |",
        "| --- | --- |",
        "| R-1 | Pass |",
        "",
        "Citations:",
        "[protocol.pdf, p. 2]",
        "[datasheet.pdf, p. 4]",
      ].join("\n")
    );
  });

  it("does not duplicate citations already at the end", () => {
    const markdown = [
      "Outcome is Pass [protocol.pdf, p. 2].",
      "",
      "Citations:",
      "[protocol.pdf, p. 2]",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      ["Outcome is Pass.", "", "Citations:", "[protocol.pdf, p. 2]"].join("\n")
    );
  });

  it("rewrites a bare trailing cite list under a Citations heading", () => {
    const markdown = [
      "Outcome is Pass [protocol.pdf, p. 2].",
      "",
      "[protocol.pdf, p. 2]",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      ["Outcome is Pass.", "", "Citations:", "[protocol.pdf, p. 2]"].join("\n")
    );
  });
});

describe("splitEditForCitationsAtEnd", () => {
  it("splits a body insert plus citation into a two-part edit", () => {
    expect(
      splitEditForCitationsAtEnd({
        anchorText: "output power was acceptable",
        deleteText: "",
        insertText: " at 9.8 W [protocol.pdf, p. 3]",
      })
    ).toEqual({
      anchorText: "output power was acceptable",
      deleteText: "",
      insertText: " at 9.8 W",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n[protocol.pdf, p. 3]",
      },
    });
  });

  it("keeps a scoped cell edit and appends the citation at the field end", () => {
    const split = splitEditForCitationsAtEnd({
      anchorText: "",
      deleteText: "Pass",
      insertText: "Pass — see protocol [protocol.pdf, p. 1]",
      scope: { kind: "cell", row: 2, col: 3 },
    });
    expect(split.scope).toEqual({ kind: "cell", row: 2, col: 3 });
    expect(split.insertText).toBe("Pass — see protocol");
    expect(split.second).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "Citations:\n[protocol.pdf, p. 1]",
    });
  });

  it("promotes a citation-only insert to a single end-of-field append", () => {
    expect(
      splitEditForCitationsAtEnd({
        anchorText: "the requirement is met",
        deleteText: "",
        insertText: " [protocol.pdf, p. 2]",
      })
    ).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "Citations:\n[protocol.pdf, p. 2]",
    });
  });

  it("does not repeat the Citations heading when the field already has one", () => {
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
      insertText: " for configuration B",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "[datasheet.pdf, p. 4]",
      },
    });
  });

  it("strips a leftover Citations heading from second.insertText", () => {
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
      insertText: " at 9.8 W",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n[protocol.pdf, p. 3]",
      },
    });
  });

  it("skips citations already present in the field", () => {
    expect(
      splitEditForCitationsAtEnd(
        {
          anchorText: "the requirement is met",
          deleteText: "",
          insertText: " for configuration A [protocol.pdf, p. 2]",
        },
        { existingFieldText: "Existing note [protocol.pdf, p. 2]" }
      )
    ).toEqual({
      anchorText: "the requirement is met",
      deleteText: "",
      insertText: " for configuration A",
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
      insertText: " at 9.8 W",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "Citations:\n[protocol.pdf, p. 3]",
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
  it("pulls cites out of edited cells and returns an append part", () => {
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
    expect(operation.cells[0]?.insertText).toBe("Pass");
    expect(citationAppendPart(citations, "Existing prose")).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "Citations:\n[protocol.pdf, p. 3]",
    });
    expect(
      citationAppendPart(
        citations,
        ["Existing prose", "", "Citations:", "[other.pdf, p. 1]"].join("\n")
      )
    ).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "[protocol.pdf, p. 3]",
    });
    expect(
      citationAppendPart(citations, "Already cited [protocol.pdf, p. 3]")
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
  it("dedupes repeated cites", () => {
    expect(
      extractCitationBrackets("[a.pdf, p. 1] and again [a.pdf, p. 1]")
    ).toEqual(["[a.pdf, p. 1]"]);
  });
});

describe("stripTrailingCitationBlockFromText", () => {
  it("drops a trailing Citations: list and keeps the body", () => {
    expect(
      stripTrailingCitationBlockFromText(
        "Verify REQ-101.\n\nCitations:\n[protocol.pdf, p. 3]\n[results.xlsx, p. 1]"
      )
    ).toBe("Verify REQ-101.");
  });

  it("leaves body-only text unchanged", () => {
    expect(stripTrailingCitationBlockFromText("Verify REQ-101.")).toBe(
      "Verify REQ-101."
    );
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
            content: [{ type: "text", text: "Verify REQ-101." }],
          },
          { type: "paragraph" },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Citations:" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "[protocol.pdf, p. 3]" }],
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
