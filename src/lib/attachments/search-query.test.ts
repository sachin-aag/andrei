import { describe, expect, it } from "vitest";
import {
  buildKeywordTsQuery,
  lexicalSearchNeedles,
  planSearchQuery,
} from "./search-query";
import { MEDIA_FILL_PHRASE_FAMILY } from "@/lib/ai/chat/search-phrase-families";

describe("buildKeywordTsQuery", () => {
  it("keeps a two-word query as a phrase instead of OR-splitting Fill", () => {
    const tsQuery = buildKeywordTsQuery("Media Fill");
    expect(tsQuery).toBe('"media fill"');
    expect(tsQuery).not.toMatch(/\bor\b/);
    expect(tsQuery?.toLowerCase()).not.toContain("filling");
  });

  it("keeps quoted phrases intact", () => {
    expect(buildKeywordTsQuery('"aseptic process simulation"')).toBe(
      '"aseptic process simulation"'
    );
  });

  it("drops stopwords and ANDs remaining concepts", () => {
    expect(
      buildKeywordTsQuery("what was the sterilization cycle for autoclave AC-12")
    ).toBe("sterilization cycle autoclave AC-12");
  });

  it("skips punctuation-only input so the keyword arm is not queried", () => {
    expect(buildKeywordTsQuery("???")).toBeNull();
    expect(buildKeywordTsQuery("...")).toBeNull();
    expect(buildKeywordTsQuery("")).toBeNull();
  });

  it("ORs media-fill family alternatives without matching fill or processing alone", () => {
    const tsQuery = buildKeywordTsQuery("Media Fill", [MEDIA_FILL_PHRASE_FAMILY]);
    expect(tsQuery).toContain('"media fill"');
    expect(tsQuery).toContain("mediafill");
    expect(tsQuery).toContain('"media-fill"');
    expect(tsQuery).toContain('"aseptic process simulation"');
    expect(tsQuery).not.toMatch(/(^|or )\s*fill(\s|$)/i);
    expect(tsQuery).not.toMatch(/\bprocessing\b/i);
  });
});

describe("lexicalSearchNeedles", () => {
  it("uses the phrase for ILIKE and does not AND Fill as a substring", () => {
    const needles = lexicalSearchNeedles(planSearchQuery("Media Fill"));
    expect(needles.phrases).toEqual(["media fill"]);
    expect(needles.tokens).toEqual([]);
  });
});
