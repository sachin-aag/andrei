import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyRetrievalQuery } from "@/lib/attachments/retrieval-query";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/retrieval-cases.json"
);

describe("retrieval-cases.json", () => {
  const cases = parseRetrievalCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );

  it("has about twenty public gold cases with unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(18);
    expect(cases.length).toBeLessThanOrEqual(30);
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares kind that matches classifyRetrievalQuery", () => {
    for (const entry of cases) {
      expect(classifyRetrievalQuery(entry.query).kind).toBe(entry.kind);
    }
  });

  it("uses in-repo sample filenames", () => {
    const filenames = new Set(
      cases.flatMap((entry) => entry.gold.map((hit) => hit.filename))
    );
    expect(filenames.has("appendix-b-790-00134r-revu.pdf")).toBe(true);
    expect(filenames.has("SOP-DP-QA-010-R04 SOP.pdf")).toBe(true);
  });

  it("has real content assertions, not just page-hit assertions", () => {
    // recallAtK can score 1.0 while every excerpt shows the wrong part of a
    // matched page; excerptHitAtK only means something once cases declare
    // mustContain. Guard against the schema going in but no case ever using
    // it (silently reverting to page-hit-only coverage).
    const withMustContain = cases.filter((entry) =>
      entry.gold.some((hit) => (hit.mustContain?.length ?? 0) > 0)
    );
    expect(withMustContain.length).toBeGreaterThanOrEqual(6);
  });

  it("every mustContain entry is a non-empty, trimmed string", () => {
    for (const entry of cases) {
      for (const hit of entry.gold) {
        for (const term of hit.mustContain ?? []) {
          expect(term.trim().length).toBeGreaterThan(0);
          expect(term).toBe(term.trim());
        }
      }
    }
  });

  it("cases without mustContain document why in notes", () => {
    // Not a hard requirement everywhere, but every SOP/appendix-b case that
    // skips mustContain should say why (scan-only, paraphrase, OCR
    // fragility) so a future contributor doesn't assume it was an oversight.
    const sopAndAppendixB = cases.filter((entry) =>
      entry.gold.some(
        (hit) =>
          hit.filename === "SOP-DP-QA-010-R04 SOP.pdf" ||
          hit.filename === "appendix-b-790-00134r-revu.pdf"
      )
    );
    const undocumentedGaps = sopAndAppendixB.filter(
      (entry) =>
        !entry.gold.some((hit) => (hit.mustContain?.length ?? 0) > 0) &&
        !entry.notes
    );
    expect(undocumentedGaps.map((entry) => entry.id)).toEqual([]);
  });
});
