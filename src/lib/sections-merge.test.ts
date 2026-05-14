import { describe, expect, it } from "vitest";
import {
  mergeAnalyzeSection,
  mergeControlSection,
  mergeMeasureSection,
  mergeSection,
} from "@/lib/sections-merge";
import { legacyStringToDoc, richJsonToPlainText } from "@/lib/tiptap/rich-text";

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
    expect(analyze.fiveWhy.narrative).toBe("");
  });

  it("flattens legacy 5-Why rows into a narrative", () => {
    const analyze = mergeAnalyzeSection({
      fiveWhy: {
        whys: [
          { question: "Why did logging stop?", answer: "Communication failed." },
          { question: "Why did communication fail?", answer: "The HMI time drifted." },
        ],
        conclusion: "Weak battery caused the drift.",
      },
    });

    expect(analyze.fiveWhy.narrative).toContain("1. Why: Why did logging stop?");
    expect(analyze.fiveWhy.narrative).toContain("Ans. Communication failed.");
    expect(analyze.fiveWhy.conclusion).toBe("Weak battery caused the drift.");
  });

  it("folds legacy measure regulatory notification into the narrative", () => {
    const measure = mergeMeasureSection({
      narrative: legacyStringToDoc("Reviewed temperature excursion data."),
      regulatoryNotification: "Not Applicable",
    });

    const measureText = richJsonToPlainText(measure.narrative);
    expect(measureText).toContain("Reviewed temperature excursion data.");
    expect(measureText).toContain("Regulatory Notification: Not Applicable");
    expect(measure.regulatoryNotification).toBeUndefined();
  });
});
