import { describe, expect, it } from "vitest";
import {
  markdownHasTable,
  markdownToDoc,
  markdownToPlainText,
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

  it("converts headings up to level 3", () => {
    const doc = markdownToDoc("## Investigation Summary");
    expect(doc.content).toEqual([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Investigation Summary" }],
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
  it("strips bold markers and heading hashes", () => {
    expect(markdownToPlainText("## Title\n\n**Bold** text")).toBe(
      "Title\n\nBold text"
    );
  });
});
