import { describe, expect, it } from "vitest";
import {
  MEDIA_FILL_PHRASE_FAMILY,
  MONITORING_PHRASE_FAMILY,
  phraseFamiliesForReviewObjective,
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

  it("expands Monitoring for that section and a monitoring objective", () => {
    expect(phraseFamiliesForSection("elr_monitoring")).toEqual([
      MONITORING_PHRASE_FAMILY,
    ]);
    expect(phraseFamiliesForReviewObjective("elr_monitoring")).toEqual([
      MONITORING_PHRASE_FAMILY,
    ]);
    expect(
      phraseFamiliesForReviewObjective("extract monitoring records")
    ).toEqual([MONITORING_PHRASE_FAMILY]);
    expect(phraseFamiliesForReviewObjective("every requirement")).toEqual([]);
  });
});

describe("planDocumentSearchQuery", () => {
  it("expands a media-fill query when that section is in scope", () => {
    const plan = planDocumentSearchQuery("Media Fill", "elr_media_fill");
    expect(plan.tsQuery).toContain('"aseptic process simulation"');
    expect(plan.tsQuery).toContain(" or ");
  });

  it("expands a monitoring query when that section is in scope", () => {
    const plan = planDocumentSearchQuery("monitoring", "elr_monitoring");
    expect(plan.tsQuery).toContain('"environmental monitoring"');
    expect(plan.tsQuery).toContain("non-viable");
    expect(plan.tsQuery).toContain('"glove monitoring"');
  });

  it("does not expand an unrelated query in that section", () => {
    const plan = planDocumentSearchQuery("deviation number", "elr_media_fill");
    expect(plan.tsQuery).toBe('"deviation number"');
    expect(plan.tsQuery).not.toContain("media fill");
    expect(plan.families).toEqual([]);
  });
});
