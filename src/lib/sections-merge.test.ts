import { describe, expect, it } from "vitest";
import { mergeControlSection, mergeSection } from "@/lib/sections-merge";

describe("sections merge", () => {
  it("coerces legacy preventive action arrays into readable text", () => {
    const control = mergeControlSection({
      preventiveActions: [
        {
          description: "Retrain operators",
          linkedRootCause: "Procedure gap",
          responsiblePerson: "QA Manager",
          dueDate: "2026-05-15",
          expectedOutcome: "Operators follow revised SOP",
          effectivenessVerification: "Batch record audit",
        },
      ],
    });

    expect(control.preventiveActions).toContain("PA-001");
    expect(control.preventiveActions).toContain("Description: Retrain operators");
    expect(control.preventiveActions).toContain("Responsible: QA Manager");
  });

  it("preserves nested defaults when merging sparse analyze content", () => {
    const analyze = mergeSection("analyze", {
      sixM: { man: "Training gap" },
    });

    expect(analyze.sixM.man).toBe("Training gap");
    expect(analyze.sixM.machine).toBe("");
    expect(analyze.fiveWhy.whys).toHaveLength(5);
  });
});
