import { describe, expect, it } from "vitest";
import {
  hydrateLiteralMarkdownInDoc,
  markdownHasTable,
  markdownToDoc,
  markdownToPlainText,
  promoteAtxHeadingsInDoc,
} from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

describe("markdownToDoc", () => {
  it("converts paragraphs split by blank lines", () => {
    const doc = markdownToDoc("First paragraph.\n\nSecond paragraph.");
    expect(doc.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First paragraph." }] },
      { type: "paragraph", content: [{ type: "text", text: "Second paragraph." }] },
    ]);
  });

  it("returns an empty doc for blank input", () => {
    expect(markdownToDoc("  \n\n ")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("renders headings as bold paragraphs (editor has no heading node)", () => {
    const doc = markdownToDoc("## Investigation Summary");
    expect(doc.content).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Investigation Summary", marks: [{ type: "bold" }] },
        ],
      },
    ]);
  });

  it("converts bullet lists including * markers", () => {
    const doc = markdownToDoc("- alpha\n* beta");
    expect(doc.content).toHaveLength(1);
    const list = doc.content![0]!;
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
  });

  it("converts ordered lists", () => {
    const doc = markdownToDoc("1. first\n2. second");
    const list = doc.content![0]!;
    expect(list.type).toBe("orderedList");
    expect(list.content).toHaveLength(2);
    expect(list.content![1]!.content![0]!.content).toEqual([
      { type: "text", text: "second" },
    ]);
  });

  it("parses bold spans into bold marks", () => {
    const doc = markdownToDoc("Batch **B-123** failed.");
    expect(doc.content![0]!.content).toEqual([
      { type: "text", text: "Batch " },
      { type: "text", text: "B-123", marks: [{ type: "bold" }] },
      { type: "text", text: " failed." },
    ]);
  });

  it("parses italic title spans at the start of a line", () => {
    const doc = markdownToDoc(
      "*Solea Model 3 Software Requirements Document* 822-700-0013"
    );
    expect(doc.content![0]!.content).toEqual([
      {
        type: "text",
        text: "Solea Model 3 Software Requirements Document",
        marks: [{ type: "italic" }],
      },
      { type: "text", text: " 822-700-0013" },
    ]);
  });

  it("parses underscore italic and leaves spaced asterisks literal", () => {
    const doc = markdownToDoc("See _Annex B_ or 2 * 3 * 4.");
    expect(doc.content![0]!.content).toEqual([
      { type: "text", text: "See " },
      { type: "text", text: "Annex B", marks: [{ type: "italic" }] },
      { type: "text", text: " or 2 * 3 * 4." },
    ]);
  });

  it("converts a GFM table with header row", () => {
    const doc = markdownToDoc(
      ["| Parameter | Result |", "| --- | --- |", "| pH | 6.8 |", "| Temp | 22 C |"].join(
        "\n"
      )
    );
    const table = doc.content![0]!;
    expect(table.type).toBe("table");
    expect(table.content).toHaveLength(3);
    const headerRow = table.content![0]!;
    expect(headerRow.content![0]!.type).toBe("tableHeader");
    expect(headerRow.content![0]!.content![0]!.content).toEqual([
      { type: "text", text: "Parameter" },
    ]);
    const dataRow = table.content![1]!;
    expect(dataRow.content![1]!.type).toBe("tableCell");
    expect(dataRow.content![1]!.content![0]!.content).toEqual([
      { type: "text", text: "6.8" },
    ]);
  });

  it("pads short table rows to the widest row", () => {
    const doc = markdownToDoc(
      ["| A | B | C |", "| --- | --- | --- |", "| 1 |"].join("\n")
    );
    const table = doc.content![0]!;
    expect(table.content![1]!.content).toHaveLength(3);
  });

  it("handles escaped pipes inside table cells", () => {
    const doc = markdownToDoc(
      ["| Spec | Value |", "| --- | --- |", "| limit | 5 \\| 10 |"].join("\n")
    );
    const cell = doc.content![0]!.content![1]!.content![1]!;
    expect(cell.content![0]!.content).toEqual([{ type: "text", text: "5 | 10" }]);
  });

  it("treats pipe lines without a separator as plain paragraphs", () => {
    const doc = markdownToDoc("| just text with pipes |");
    expect(doc.content![0]!.type).toBe("paragraph");
  });

  it("round-trips through richJsonToPlainText markdown tables", () => {
    const markdown = [
      "Summary line.",
      "",
      "| Parameter | Result |",
      "| --- | --- |",
      "| pH | 6.8 |",
    ].join("\n");
    const text = richJsonToPlainText(markdownToDoc(markdown), {
      tableFormat: "markdown",
    });
    expect(text).toContain("Summary line.");
    expect(text).toContain("| Parameter | Result |");
    expect(text).toContain("| pH | 6.8 |");
  });

  it("inserts a blank paragraph above a Citations heading", () => {
    const withBlankLine = markdownToDoc(
      "This document outlines the purpose.\n\nCitations:\n[protocol.pdf, p. 1]"
    );
    const flush = markdownToDoc(
      "This document outlines the purpose.\nCitations:\n[protocol.pdf, p. 1]"
    );
    const expected = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "This document outlines the purpose." }],
      },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Citations:" }] },
      {
        type: "paragraph",
        content: [{ type: "text", text: "[protocol.pdf, p. 1]" }],
      },
    ];
    expect(withBlankLine.content).toEqual(expected);
    expect(flush.content).toEqual(expected);
  });

  it("keeps unsupported markdown as literal text", () => {
    const doc = markdownToDoc("Some `code` and [link](http://x)");
    expect(doc.content![0]!.content).toEqual([
      { type: "text", text: "Some `code` and [link](http://x)" },
    ]);
  });
});

describe("markdownHasTable", () => {
  it("detects a GFM table", () => {
    expect(markdownHasTable("| A |\n| --- |\n| 1 |")).toBe(true);
  });

  it("ignores pipes without a separator row", () => {
    expect(markdownHasTable("| A |\n| 1 |")).toBe(false);
    expect(markdownHasTable("plain text")).toBe(false);
  });
});

describe("markdownToPlainText", () => {
  it("strips bold markers, italic markers, and heading hashes", () => {
    expect(markdownToPlainText("## Title\n\n**Bold** and *italic* text")).toBe(
      "Title\n\nBold and italic text"
    );
  });
});

describe("promoteAtxHeadingsInDoc", () => {
  it("turns a literal ### paragraph into a bold paragraph", () => {
    const doc = promoteAtxHeadingsInDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "### Corrective Actions" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Retrain the operator." }],
        },
      ],
    });
    expect(doc.content).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Corrective Actions", marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Retrain the operator." }],
      },
    ]);
  });

  it("leaves hashes that are not an ATX heading at the start of the paragraph", () => {
    const paragraph = {
      type: "paragraph",
      content: [{ type: "text", text: "See ### notes in the annex." }],
    };
    expect(
      promoteAtxHeadingsInDoc({ type: "doc", content: [paragraph] })
    ).toEqual({ type: "doc", content: [paragraph] });
  });
});

describe("hydrateLiteralMarkdownInDoc", () => {
  it("renders a corrective-action markdown blob that lives in one paragraph", () => {
    const blob = [
      "### Corrective Actions",
      "1. **Retrospective Monitoring:** Collect [Lab Report Number: <to be filled>] dated [Date: <to be filled>].",
      "2. **Personnel Training:** Retrain operators.",
      "3. **Effectiveness Check:** Review on [Date: <to be filled>].",
      "",
      "### Preventive Actions",
      "1. Update the SOP.",
    ].join("\n");

    const doc = hydrateLiteralMarkdownInDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: blob }] }],
    });

    expect(doc.content?.some((node) => node.type === "orderedList")).toBe(true);
    const plain = richJsonToPlainText(doc);
    expect(plain).not.toContain("###");
    expect(plain).not.toContain("**");
    expect(plain).toContain("Corrective Actions");
    expect(plain).toContain("Retrospective Monitoring:");
    expect(plain).toContain("Personnel Training:");
  });

  it("hydrates consecutive markdown paragraphs and leaves plain prose", () => {
    const doc = hydrateLiteralMarkdownInDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "### Corrective Actions" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "1. **Personnel Training:** Retrain operators." },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Normal follow-up sentence." }],
        },
      ],
    });

    expect(doc.content?.[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "Corrective Actions", marks: [{ type: "bold" }] },
      ],
    });
    expect(doc.content?.[1]?.type).toBe("orderedList");
    expect(doc.content?.[2]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Normal follow-up sentence." }],
    });
  });

  it("does not rewrite paragraphs that only mention hashes mid-sentence", () => {
    const paragraph = {
      type: "paragraph",
      content: [{ type: "text", text: "See ### notes in the annex." }],
    };
    expect(
      hydrateLiteralMarkdownInDoc({ type: "doc", content: [paragraph] })
    ).toEqual({ type: "doc", content: [paragraph] });
  });
});
