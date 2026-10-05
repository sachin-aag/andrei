import { describe, expect, it } from "vitest";
import {
  coerceReviewSeverity,
  compareSeverityDesc,
  countFindingSeverities,
  severityForEvalStatus,
  sortCategoriesBySeverity,
  worstSeverity,
} from "@/lib/review/severity";

describe("review severity", () => {
  it("maps eval status and leftover enum values", () => {
    expect(severityForEvalStatus("not_met")).toBe("critical");
    expect(severityForEvalStatus("partially_met")).toBe("major");
    expect(coerceReviewSeverity("error")).toBe("critical");
    expect(coerceReviewSeverity("warning")).toBe("major");
    expect(coerceReviewSeverity("info")).toBe("minor");
  });

  it("sorts findings critical first", () => {
    const ranked = ["minor", "critical", "major"].toSorted(compareSeverityDesc);
    expect(ranked).toEqual(["critical", "major", "minor"]);
  });

  it("orders categories that have critical findings first", () => {
    const ordered = sortCategoriesBySeverity(
      ["report", "fda", "citations", "writing"],
      (category) => {
        if (category === "writing") return { critical: 2, major: 0, minor: 0 };
        if (category === "citations") return { critical: 0, major: 4, minor: 0 };
        if (category === "report") return { critical: 0, major: 0, minor: 1 };
        return { critical: 0, major: 0, minor: 0 };
      }
    );
    expect(ordered).toEqual(["writing", "citations", "report", "fda"]);
  });

  it("counts and reports the worst open grade", () => {
    const counts = countFindingSeverities([
      { severity: "minor" },
      { severity: "major" },
      { severity: "error" },
    ]);
    expect(counts).toEqual({ critical: 1, major: 1, minor: 1 });
    expect(worstSeverity(counts)).toBe("critical");
    expect(worstSeverity({ critical: 0, major: 0, minor: 0 })).toBeNull();
  });
});
