import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyRetrievalQuery } from "@/lib/attachments/retrieval-query";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";
import {
  CORPUS_ANCHORS,
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

  it("puts mustContain on every gold hit with a unique answering substring", () => {
    const expected: Record<string, string[]> = {
      "equipment-required-instrument": [CORPUS_ANCHORS.narda],
      "equipment-table-heading": [CORPUS_ANCHORS.requiredTable],
      "equipment-executed-log-negative": [CORPUS_ANCHORS.digitalCalipers],
      "equipment-page-2-locator": [CORPUS_ANCHORS.requiredTable],
      "sw-eval-7-identifier": [CORPUS_ANCHORS.swEval7],
      "sw-eval-7-description": [
        CORPUS_ANCHORS.swEval7,
        CORPUS_ANCHORS.interlock,
      ],
      "software-file-locator": [CORPUS_ANCHORS.swEval7],
      "cross-file-no-leak": [CORPUS_ANCHORS.swEval7],
    };
    for (const entry of cases) {
      if (entry.gold.length === 0) {
        expect(entry.mustNotContainAnywhere?.length ?? 0).toBeGreaterThan(0);
        continue;
      }
      expect(expected[entry.id], entry.id).toBeDefined();
      expect(entry.gold).toHaveLength(1);
      expect(entry.gold[0]?.mustContain).toEqual(expected[entry.id]);
    }
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
