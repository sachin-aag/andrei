import { describe, expect, it } from "vitest";
import {
  citationAppendPart,
  documentCitationRule,
  extractCitationBrackets,
  isCitationOnlyText,
  moveCitationsToEndOfText,
  prepareEditForCitationMode,
  splitEditForCitationsAtEnd,
  stripCitationsFromTableOperation,
  stripCitationsFromText,
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
        "[protocol.pdf, p. 2]",
        "[datasheet.pdf, p. 4]",
      ].join("\n")
    );
  });

  it("does not duplicate citations already at the end", () => {
    const markdown = [
      "Outcome is Pass [protocol.pdf, p. 2].",
      "",
      "[protocol.pdf, p. 2]",
    ].join("\n");
    expect(moveCitationsToEndOfText(markdown)).toBe(
      ["Outcome is Pass.", "", "[protocol.pdf, p. 2]"].join("\n")
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
        insertText: "[protocol.pdf, p. 3]",
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
      insertText: "[protocol.pdf, p. 1]",
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
      insertText: "[protocol.pdf, p. 2]",
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
        insertText: "[protocol.pdf, p. 3]",
      },
    });
  });
});

describe("documentCitationRule", () => {
  it("asks for inline cites when the mode is off and end-of-section when on", () => {
    expect(documentCitationRule(false)).toContain("in prose");
    expect(documentCitationRule(false)).not.toContain("end of the section");
    expect(documentCitationRule(true)).toContain("end of the section field");
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
      insertText: "[protocol.pdf, p. 3]",
    });
    expect(
      citationAppendPart(citations, "Already cited [protocol.pdf, p. 3]")
    ).toBeUndefined();
  });
});

describe("extractCitationBrackets", () => {
  it("dedupes repeated cites", () => {
    expect(
      extractCitationBrackets("[a.pdf, p. 1] and again [a.pdf, p. 1]")
    ).toEqual(["[a.pdf, p. 1]"]);
  });
});
