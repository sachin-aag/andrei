import { describe, expect, it } from "vitest";
import {
  buildOutlineFromStoredPages,
  derivePageMetadata,
  derivePageOutlineDigest,
  detectRecurringBoilerplate,
  groupOutlineSpans,
  isPlaceholderPageContext,
} from "./page-outline";

describe("derivePageOutlineDigest", () => {
  it("strips recurring headers and keeps requirement IDs plus a heading", () => {
    const transcript = [
      "CONVERGENT DENTAL",
      "PROPRIETARY",
      "Page 31",
      "TABLE 4 SOFTWARE REQUIREMENTS",
      "SW-LWB-4 Laser wavelength bandwidth Pass Fail measured 10.6 um",
      "SW-LWB-5 Additional wavelength check Pass",
    ].join("\n");

    const digest = derivePageOutlineDigest(transcript, {
      recurringLines: new Set(["convergent dental", "proprietary", "page 31"]),
    });

    expect(digest).toContain("TABLE 4 SOFTWARE REQUIREMENTS");
    expect(digest).toContain("SW-LWB-4");
    expect(digest).toContain("SW-LWB-5");
    expect(digest.toLowerCase()).not.toContain("convergent dental");
  });

  it("keeps dotted requirement IDs in the digest", () => {
    const digest = derivePageOutlineDigest(
      "REQUIREMENTS VERIFIED\nSW-IN-1.1 SW-SST-5.1.1 SW-EH-1.2 Pass"
    );
    expect(digest).toContain("SW-IN-1.1");
    expect(digest).toContain("SW-SST-5.1.1");
    expect(digest).toContain("SW-EH-1.2");
  });

  it("exposes heading and stored identifiers separately from the digest", () => {
    const meta = derivePageMetadata(
      "TABLE 4 SOFTWARE REQUIREMENTS\nSW-LWB-4 Laser wavelength bandwidth Pass"
    );
    expect(meta.outlineTitle).toBe("TABLE 4 SOFTWARE REQUIREMENTS");
    expect(meta.identifiers).toEqual(["SW-LWB-4"]);
    expect(meta.digest).toContain("SW-LWB-4");
  });

  it("returns empty for boilerplate-only pages", () => {
    expect(derivePageOutlineDigest("Page 4\nCONFIDENTIAL\n12")).toBe("");
  });
});

describe("detectRecurringBoilerplate", () => {
  it("flags lines that repeat across most pages", () => {
    const pages = [
      "CONVERGENT DENTAL\nSW-SST-1 Soft tissue\nPage 1",
      "CONVERGENT DENTAL\nSW-SIB-1 Interlock\nPage 2",
      "CONVERGENT DENTAL\nSW-LWB-1 Wavelength\nPage 3",
    ];
    const recurring = detectRecurringBoilerplate(pages);
    expect(recurring.has("convergent dental")).toBe(true);
    expect(recurring.has("sw-sst-1 soft tissue")).toBe(false);
  });
});

describe("buildOutlineFromStoredPages", () => {
  it("derives digests from transcripts when pageContext is blank or a page index", () => {
    const outline = buildOutlineFromStoredPages([
      {
        pageNumber: 4,
        printedPageLabel: "4",
        pageContext: "Page 4 Page 5 Page 6",
        transcript:
          "TABLE 4 SOFTWARE REQUIREMENTS\nSW-SST-1 Soft tissue Config: 1.0 W Pass",
      },
      {
        pageNumber: 5,
        printedPageLabel: "5",
        pageContext: null,
        transcript: "TABLE 4 SOFTWARE REQUIREMENTS\nSW-SIB-2 Safety interlock Pass",
      },
    ]);
    expect(outline.pages[0]?.pageContext).toContain("SW-SST-1");
    expect(outline.pages[0]?.pageContext).not.toMatch(/^Page 4 Page 5 Page 6$/);
    expect(outline.pages[1]?.pageContext).toContain("SW-SIB-2");
    expect(outline.spans[0]).toMatchObject({
      title: "TABLE 4 SOFTWARE REQUIREMENTS",
      pageStart: 4,
      pageEnd: 5,
    });
  });

  it("keeps a stored Gemini pageContext when it is already useful", () => {
    const outline = buildOutlineFromStoredPages([
      {
        pageNumber: 1,
        pageContext: "Cover sheet — document 790-00134R Rev U",
        transcript: "CONVERGENT DENTAL\nCover",
      },
    ]);
    expect(outline.pages[0]?.pageContext).toBe(
      "Cover sheet — document 790-00134R Rev U"
    );
  });
});

describe("isPlaceholderPageContext", () => {
  it("treats page-index summaries as empty", () => {
    expect(isPlaceholderPageContext("Page 4 Page 5 Page 6")).toBe(true);
    expect(isPlaceholderPageContext("TABLE 4 SOFTWARE REQUIREMENTS")).toBe(false);
  });
});

describe("groupOutlineSpans", () => {
  it("groups adjacent pages that share a heading", () => {
    const spans = groupOutlineSpans([
      { pageNumber: 10, digest: "TABLE 4 SOFTWARE REQUIREMENTS — SW-SST-1" },
      { pageNumber: 11, digest: "TABLE 4 SOFTWARE REQUIREMENTS — SW-SST-2" },
      { pageNumber: 12, digest: "TABLE 5 RESULTS — SW-LWB-1" },
    ]);
    expect(spans).toEqual([
      {
        title: "TABLE 4 SOFTWARE REQUIREMENTS",
        pageStart: 10,
        pageEnd: 11,
      },
      { title: "TABLE 5 RESULTS", pageStart: 12, pageEnd: 12 },
    ]);
  });
});
