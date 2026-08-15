import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("evaluation attachment exclusion", () => {
  it("keeps evaluation prompt builders independent of attachment retrieval", () => {
    const evaluateSource = source("src/lib/ai/evaluate.ts");
    const sectionContextSource = source("src/lib/ai/section-context.ts");

    for (const content of [evaluateSource, sectionContextSource]) {
      expect(content).not.toContain("search_documents");
      expect(content).not.toContain("searchReportDocuments");
      expect(content).not.toContain("documentChunks");
      expect(content).not.toContain("@/lib/attachments/retrieval");
    }
  });
});
