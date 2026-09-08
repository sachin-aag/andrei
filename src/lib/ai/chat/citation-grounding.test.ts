import { describe, expect, it } from "vitest";
import {
  citationOutOfRangeMessage,
  outOfRangeCitations,
  parsedCitationsInText,
  tableOperationCitationTexts,
} from "@/lib/ai/chat/citation-grounding";

const attachments = [
  {
    id: "att-1",
    filename: "protocol.pdf",
    pageCount: 61,
  },
  {
    id: "att-2",
    filename: "appendix-b.pdf",
    pageCount: null,
  },
];

describe("parsedCitationsInText", () => {
  it("parses page cites and ignores placeholders", () => {
    expect(
      parsedCitationsInText(
        "Met spec [protocol.pdf, p. 3]. Use [batch number] later."
      )
    ).toEqual([{ filename: "protocol.pdf", pages: [3] }]);
  });

  it("parses multi-page cites on one file", () => {
    expect(parsedCitationsInText("[protocol.pdf, p. 4, 26]")).toEqual([
      { filename: "protocol.pdf", pages: [4, 26] },
    ]);
  });
});

describe("outOfRangeCitations", () => {
  it("flags pages above the attachment pageCount", () => {
    expect(
      outOfRangeCitations(
        ["See [protocol.pdf, p. 104] for the objective."],
        attachments
      )
    ).toEqual([
      {
        raw: "[protocol.pdf, p. 104]",
        filename: "protocol.pdf",
        page: 104,
        pageCount: 61,
      },
    ]);
  });

  it("allows in-range pages", () => {
    expect(
      outOfRangeCitations(["[protocol.pdf, p. 3]"], attachments)
    ).toEqual([]);
  });

  it("skips unresolvable filenames", () => {
    expect(
      outOfRangeCitations(["[Appendix B, p. 99]"], attachments)
    ).toEqual([]);
  });

  it("skips attachments with unknown pageCount", () => {
    expect(
      outOfRangeCitations(["[appendix-b.pdf, p. 999]"], attachments)
    ).toEqual([]);
  });

  it("dedupes repeated violations", () => {
    expect(
      outOfRangeCitations(
        ["[protocol.pdf, p. 104]", "[protocol.pdf, p. 104]"],
        attachments
      )
    ).toHaveLength(1);
  });
});

describe("citationOutOfRangeMessage", () => {
  it("names the file page count and PDF page rule", () => {
    expect(
      citationOutOfRangeMessage([
        {
          raw: "[protocol.pdf, p. 104]",
          filename: "protocol.pdf",
          page: 104,
          pageCount: 61,
        },
      ])
    ).toContain("61 pages");
    expect(
      citationOutOfRangeMessage([
        {
          raw: "[protocol.pdf, p. 104]",
          filename: "protocol.pdf",
          page: 104,
          pageCount: 61,
        },
      ])
    ).toMatch(/absolute PDF page/i);
  });
});

describe("tableOperationCitationTexts", () => {
  it("collects cell insert text from edit_cells", () => {
    expect(
      tableOperationCitationTexts({
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 1, insertText: "Pass [protocol.pdf, p. 2]" }],
      })
    ).toEqual(["Pass [protocol.pdf, p. 2]"]);
  });
});
