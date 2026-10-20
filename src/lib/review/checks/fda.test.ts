import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { fdaCriteriaForDocumentType } from "@/lib/review/fda-criteria";
import { fdaCheckId, groupFdaCriteriaBySection } from "@/lib/review/checks/fda";

describe("FDA review grouping", () => {
  it("prefixes keys that are missing fda.", () => {
    expect(fdaCheckId("211_192_thorough")).toBe("fda.211_192_thorough");
    expect(fdaCheckId("fda.oos_phase")).toBe("fda.oos_phase");
  });

  it("groups investigation FDA criteria by target section", () => {
    const grouped = groupFdaCriteriaBySection(
      fdaCriteriaForDocumentType("investigation_report")
    );
    expect(grouped.size).toBeLessThan(
      fdaCriteriaForDocumentType("investigation_report").length
    );
    expect((grouped.get("define") ?? []).map((row) => row.key)).toEqual([
      "fda.211_192_thorough",
      "fda.211_100b_deviation",
    ]);
    expect((grouped.get("analyze") ?? []).map((row) => row.key)).toEqual([
      "fda.211_192_other_batches",
      "fda.oos_phase",
    ]);
  });
});
