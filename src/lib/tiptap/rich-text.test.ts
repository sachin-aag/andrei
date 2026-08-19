import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  appendParagraphsToDoc,
  legacyStringToDoc,
  MAMMOTH_SOFT_BREAK,
  normalizeRichField,
  richJsonToPlainText,
  stripSuggestionMarksFromDoc,
} from "@/lib/tiptap/rich-text";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

describe("rich text helpers", () => {
  it("converts legacy plain text into paragraph nodes", () => {
    expect(legacyStringToDoc("Line one\nLine two")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line two" }] },
      ],
    });
  });

  it("renders ATX heading lines as bold paragraphs", () => {
    expect(legacyStringToDoc("### Corrective Actions\nRetrain operator.")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Corrective Actions", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Retrain operator." }],
        },
      ],
    });
  });

  it("promotes persisted ### hashes when normalizing a rich field", () => {
    const doc = normalizeRichField({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "### Preventive Actions" }],
        },
      ],
    });
    expect(doc.content).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Preventive Actions", marks: [{ type: "bold" }] },
        ],
      },
    ]);
  });

  it("preserves mammoth soft line breaks as hardBreak nodes", () => {
    expect(
      legacyStringToDoc(
        `Line one${MAMMOTH_SOFT_BREAK}\nLine two${MAMMOTH_SOFT_BREAK}\nLine three`
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line one" },
            { type: "hardBreak" },
            { type: "text", text: "Line two" },
            { type: "hardBreak" },
            { type: "text", text: "Line three" },
          ],
        },
      ],
    });
  });

  it("renders hardBreak nodes in plain text extraction", () => {
    expect(
      richJsonToPlainText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Line one" },
              { type: "hardBreak" },
              { type: "text", text: "Line two" },
            ],
          },
        ],
      })
    ).toBe("Line one\nLine two");
  });

  it("extracts plain text from paragraphs, headings, and lists", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Root cause" }] },
        { type: "paragraph", content: [{ type: "text", text: "Observed during review." }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Batch record" }] }] },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe(
      "Root cause\nObserved during review.\n\n• Batch record"
    );
  });

  it("appends multi-line suggestions as separate paragraphs", () => {
    const doc: JSONContent = { type: "doc", content: [] };

    expect(appendParagraphsToDoc(doc, "First\nSecond")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });
  });

  it("extracts pipe-separated plain text from table nodes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 1" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 2" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 2" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("Header 1 | Header 2\nData 1 | Data 2");
  });

  it("handles table mixed with paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before table." }] },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "After table." }] },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("Before table.\n\nA | B\n\nAfter table.");
  });

  it("renders tables as GitHub-flavored markdown when requested", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 1" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 2" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 2" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc, { tableFormat: "markdown" })).toBe(
      [
        "| Header 1 | Header 2 |",
        "| --- | --- |",
        "| Data 1 | Data 2 |",
      ].join("\n"),
    );
  });

  it("expands merged cells (rowspan/colspan) into every covered position", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Sensor" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Temp" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Duration" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "T1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "105.2" }] }] },
                {
                  type: "tableCell",
                  attrs: { rowspan: 2 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "01 hr. 24 min" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "T2" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "122.3" }] }] },
              ],
            },
          ],
        },
      ],
    };

    const md = richJsonToPlainText(doc, { tableFormat: "markdown" });
    expect(md).toBe(
      [
        "| Sensor | Temp | Duration |",
        "| --- | --- | --- |",
        "| T1 | 105.2 | 01 hr. 24 min |",
        "| T2 | 122.3 | 01 hr. 24 min |",
      ].join("\n"),
    );
  });

  it("joins multi-paragraph cells with ' / ' so markdown rows stay valid", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Display Copy" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Available / Not Applicable" }] },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Yes" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc, { tableFormat: "markdown" })).toBe(
      [
        "| Display Copy / Available / Not Applicable |",
        "| --- |",
        "| Yes |",
      ].join("\n"),
    );
  });

  it("expands colspan into every covered column", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 3 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Wide Header" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc, { tableFormat: "markdown" })).toBe(
      [
        "| Wide Header | Wide Header | Wide Header |",
        "| --- | --- | --- |",
        "| A | B | C |",
      ].join("\n"),
    );
  });

  it("renders short rows as empty markdown cells without dropping pipes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Col A" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Col B" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Col C" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc, { tableFormat: "markdown" })).toBe(
      [
        "| Col A | Col B | Col C |",
        "| --- | --- | --- |",
        "| x |  |  |",
      ].join("\n"),
    );
  });

  it("escapes pipe characters inside cell text so markdown rows stay parseable", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Range" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "a|b" }] }] },
              ],
            },
          ],
        },
      ],
    };

    const md = richJsonToPlainText(doc, { tableFormat: "markdown" });
    expect(md).toContain("| a\\|b |");
    expect(md.split("\n").every((line) => line.split(/(?<!\\)\|/).length === 3)).toBe(true);
  });

  it("preserves legacy pipe format by default", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("A | B");
  });

  it("strips suggestion marks while keeping other marks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Reviewed text",
              marks: [
                { type: suggestionInsertMarkName },
                { type: suggestionDeleteMarkName },
                { type: "bold" },
              ],
            },
          ],
        },
      ],
    };

    expect(stripSuggestionMarksFromDoc(doc).content?.[0]?.content?.[0]?.marks).toEqual([
      { type: "bold" },
    ]);
  });
});
