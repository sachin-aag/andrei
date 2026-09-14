import { describe, expect, it } from "vitest";
import {
  MEDIA_FILL_PHRASE_FAMILY,
  phraseFamiliesForSection,
  planDocumentSearchQuery,
} from "./search-phrase-families";

describe("phraseFamiliesForSection", () => {
  it("expands Media Fill only for that section", () => {
    expect(phraseFamiliesForSection("elr_media_fill")).toEqual([
      MEDIA_FILL_PHRASE_FAMILY,
    ]);
    expect(phraseFamiliesForSection("elr_qualification")).toEqual([]);
    expect(phraseFamiliesForSection("all")).toEqual([]);
  });
});

describe("planDocumentSearchQuery", () => {
  it("expands a media-fill query when that section is in scope", () => {
    const plan = planDocumentSearchQuery("Media Fill", "elr_media_fill");
    expect(plan.tsQuery).toContain('"aseptic process simulation"');
    expect(plan.tsQuery).toContain(" or ");
  });

  it("does not expand an unrelated query in that section", () => {
    const plan = planDocumentSearchQuery("deviation number", "elr_media_fill");
    expect(plan.tsQuery).toBe("deviation number");
    expect(plan.tsQuery).not.toContain("media fill");
  });
});
