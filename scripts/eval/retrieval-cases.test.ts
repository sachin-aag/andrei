import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyRetrievalQuery } from "@/lib/attachments/retrieval-query";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";
import {
  PROTOCOL_EQUIPMENT_FILENAME,
  SOFTWARE_REQUIREMENTS_FILENAME,
} from "./retrieval-corpus";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/retrieval-cases.json"
);

describe("retrieval-cases.json", () => {
  const cases = parseRetrievalCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );

  it("has a small public set with unique ids and passCriteria", () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
    expect(cases.length).toBeLessThanOrEqual(20);
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of cases) {
      expect(entry.passCriteria.trim().length).toBeGreaterThan(20);
    }
  });

  it("declares kind that matches classifyRetrievalQuery", () => {
    for (const entry of cases) {
      expect(classifyRetrievalQuery(entry.query).kind, entry.id).toBe(
        entry.kind
      );
    }
  });

  it("scores the generated eval corpus, not a customer PDF", () => {
    const filenames = new Set(
      cases.flatMap((entry) => entry.gold.map((hit) => hit.filename))
    );
    expect(filenames).toEqual(
      new Set([PROTOCOL_EQUIPMENT_FILENAME, SOFTWARE_REQUIREMENTS_FILENAME])
    );
  });

  it("requires executed-log and page-2 excerpts to show table rows, not only the page", () => {
    const executed = cases.find(
      (entry) => entry.id === "equipment-executed-log-negative"
    );
    const locator = cases.find(
      (entry) => entry.id === "equipment-page-2-locator"
    );
    expect(executed?.gold[0]?.mustContain).toEqual(["Digital Calipers"]);
    expect(locator?.gold[0]?.mustContain).toEqual([
      "Required Testing Equipment",
    ]);
  });

  it("covers identifier, locator, semantic, and a true-negative", () => {
    const kinds = new Set(cases.map((entry) => entry.kind));
    expect(kinds).toEqual(new Set(["identifier", "locator", "semantic"]));
    const negatives = cases.filter((entry) => entry.gold.length === 0);
    expect(negatives.length).toBeGreaterThanOrEqual(1);
    for (const entry of negatives) {
      expect(entry.mustNotContainAnywhere?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
