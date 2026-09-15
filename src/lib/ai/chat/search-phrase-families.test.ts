import { describe, expect, it } from "vitest";
import {
  MEDIA_FILL_PHRASE_FAMILY,
  phraseFamiliesForReviewObjective,
  phraseFamiliesForSection,
  planDocumentSearchQuery,
} from "./search-phrase-families";

describe("phraseFamiliesForSection", () => {
  it("expands Media Fill only as a stemming family", () => {
    expect(phraseFamiliesForSection("elr_media_fill")).toEqual([
      MEDIA_FILL_PHRASE_FAMILY,
    ]);
    expect(phraseFamiliesForSection("all")).toEqual([]);
  });

  it("expands Monitoring from the live table columns", () => {
    const families = phraseFamiliesForSection("elr_monitoring");
    expect(families.length).toBe(1);
    expect(families[0]).toContain("monitoring parameter");
    expect(families[0]).toContain("period covered");
    expect(families[0]).toContain("excursion");
    expect(families[0]).not.toContain("glove monitoring");
    expect(phraseFamiliesForReviewObjective("elr_monitoring")).toEqual(
      families
    );
    expect(
      phraseFamiliesForReviewObjective("extract monitoring records")
    ).toEqual(families);
    expect(phraseFamiliesForReviewObjective("every requirement")).toEqual([]);
  });
});

describe("planDocumentSearchQuery", () => {
  it("expands a media-fill query when that section is in scope", () => {
    const plan = planDocumentSearchQuery("Media Fill", "elr_media_fill");
    expect(plan.tsQuery).toContain('"aseptic process simulation"');
    expect(plan.tsQuery).toContain(" or ");
  });

  it("expands a monitoring query to sibling column headers", () => {
    const plan = planDocumentSearchQuery("monitoring", "elr_monitoring");
    expect(plan.tsQuery).toContain('"monitoring parameter"');
    expect(plan.tsQuery).toContain('"period covered"');
    expect(plan.tsQuery).toContain("excursion");
    expect(plan.tsQuery).not.toContain("glove monitoring");
  });

  it("does not expand an unrelated query in that section", () => {
    const plan = planDocumentSearchQuery("deviation number", "elr_media_fill");
    expect(plan.tsQuery).toBe('"deviation number"');
    expect(plan.tsQuery).not.toContain("media fill");
    expect(plan.families).toEqual([]);
  });
});
