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
});
