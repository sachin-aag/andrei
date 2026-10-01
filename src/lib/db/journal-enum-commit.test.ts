import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("journal enum values vs later defaults", () => {
  it("commits document_revision_source 'manual' in 0052 before 0053 uses it", () => {
    const journal = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src/db/migrations/meta/_journal.json"),
        "utf8"
      )
    ) as { entries: { idx: number; tag: string }[] };
    const addManual = journal.entries.find(
      (entry) => entry.tag === "0052_document_revision_manual"
    );
    const analyticsRevisions = journal.entries.find(
      (entry) => entry.tag === "0053_analytics_revisions"
    );
    expect(addManual).toBeDefined();
    expect(analyticsRevisions).toBeDefined();
    expect(addManual!.idx).toBeLessThan(analyticsRevisions!.idx);
  });
});
