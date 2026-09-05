import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyRetrievalQuery } from "@/lib/attachments/retrieval-query";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/retrieval-cases.local.example.json"
);

/**
 * This example is git-tracked (unlike `retrieval-cases.local.json`, which is
 * gitignored) so it stays honest as the schema evolves — it references a
 * real customer PDF ("Mechanical Test Report Attachments only.pdf") that
 * cannot be committed, so it is inert by default: copy it to
 * `retrieval-cases.local.json` once that file is ingested locally under a
 * matching filename, then `pnpm retrieval-eval -- --report-id <id>` picks
 * it up automatically (see docs/retrieval.md). CI `--from-gcs` / `--live`
 * never merge the overlay.
 */
describe("retrieval-cases.local.example.json", () => {
  const cases = parseRetrievalCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );

  it("parses under the same schema as the public cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
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

  it("every case cites a Langfuse trace or tool-verified source in notes", () => {
    for (const entry of cases) {
      expect(entry.notes, `${entry.id} is missing provenance notes`).toBeTruthy();
    }
  });

  it("has at least one excerpt-content case and one cross-document negative case", () => {
    const withMustContain = cases.filter((entry) =>
      entry.gold.some((hit) => (hit.mustContain?.length ?? 0) > 0)
    );
    const withNegative = cases.filter(
      (entry) => (entry.mustNotContainAnywhere?.length ?? 0) > 0
    );
    expect(withMustContain.length).toBeGreaterThanOrEqual(1);
    expect(withNegative.length).toBeGreaterThanOrEqual(1);
  });

  it("negative-only cases (empty gold) always declare mustNotContainAnywhere", () => {
    for (const entry of cases) {
      if (entry.gold.length === 0) {
        expect(entry.mustNotContainAnywhere?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
