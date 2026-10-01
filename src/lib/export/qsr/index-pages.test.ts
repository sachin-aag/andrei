import { describe, expect, it } from "vitest";
import {
  estimateQsrBookmarkPages,
  fillQsrIndexPageNumbers,
  formatQsrIndexPage,
  QSR_BODY_START_PAGE,
} from "./index-pages";

function bookmarkParagraph(id: string, name: string, text: string): string {
  return `<w:p><w:bookmarkStart w:id="${id}" w:name="${name}"/><w:r><w:t>${text}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
}

describe("QSR Index page numbers", () => {
  it("starts Introduction at page 5", () => {
    const pages = estimateQsrBookmarkPages([
      bookmarkParagraph("1", "_QsrIdx_1", "Introduction"),
      bookmarkParagraph("2", "_QsrIdx_1_1", "Objective"),
    ]);
    expect(pages.get("_QsrIdx_1")).toBe(QSR_BODY_START_PAGE);
    expect(pages.get("_QsrIdx_1_1")).toBe(QSR_BODY_START_PAGE);
  });

  it("advances the page when body content exceeds the landscape band", () => {
    const tall = `<w:p><w:r><w:t>${"x".repeat(5000)}</w:t></w:r></w:p>`;
    const pages = estimateQsrBookmarkPages([
      bookmarkParagraph("1", "_QsrIdx_1", "A"),
      tall,
      bookmarkParagraph("2", "_QsrIdx_2", "B"),
    ]);
    expect(pages.get("_QsrIdx_2")).toBeGreaterThan(QSR_BODY_START_PAGE);
  });

  it("prints a range only when the end bookmark is on a later page", () => {
    const pages = new Map([
      ["a", 10],
      ["b", 22],
    ]);
    expect(formatQsrIndexPage({ number: "5.1", start: "a", end: "b" }, pages)).toBe(
      "10-22"
    );
    expect(
      formatQsrIndexPage({ number: "5.1", start: "a", end: "b" }, new Map([["a", 10], ["b", 10]]))
    ).toBe("10");
    expect(formatQsrIndexPage({ number: "1", start: "missing" }, pages)).toBe("");
  });

  it("replaces Index PAGEREF fields with the estimated page number", () => {
    const xml = `<?xml version="1.0"?><w:document><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Sr. No.</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Page No</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Introduction</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:instrText> PAGEREF _QsrIdx_1 \\h </w:instrText></w:r><w:r><w:t>-</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${bookmarkParagraph("1", "_QsrIdx_1", "INTRODUCTION")}</w:body></w:document>`;
    const filled = fillQsrIndexPageNumbers(xml);
    expect(filled).not.toContain("PAGEREF");
    const rows = filled.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
    const intro = rows.find((row) => row.includes("Introduction"));
    expect(intro).toContain(`>${QSR_BODY_START_PAGE}<`);
  });
});
