import { describe, expect, it } from "vitest";
import {
  mergeAnalyzeSection,
  mergeControlSection,
  mergeImproveSection,
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

  it("folds legacy control narrative prose into preventive actions text", () => {
    const control = mergeControlSection({
      narrative: legacyStringToDoc("Closure narrative before PA table."),
      preventiveActions: "PA-001: Retrain staff.",
    });

    expect(control.preventiveActions).toContain("Closure narrative before PA table.");
    expect(control.preventiveActions).toContain("Retrain staff.");
  });

  it("coerces legacy corrective action arrays into readable text", () => {
    const improve = mergeImproveSection({
      correctiveActions: [
        {
          description: "Raise work order",
          responsiblePerson: "Engineering",
          dueDate: "2026-05-15",
          expectedOutcome: "Equipment restored",
          effectivenessVerification: "Trial run satisfactory",
        },
      ],
    });

    expect(improve.correctiveActions).toContain("CA-001");
    expect(improve.correctiveActions).toContain("Description: Raise work order");
    expect(improve.correctiveActions).toContain("Responsible: Engineering");
  });

  it("folds legacy improve narrative prose into corrective actions text", () => {
    const improve = mergeImproveSection({
      narrative: legacyStringToDoc("Intro paragraphs before corrective detail."),
      correctiveActions: "Work order WO-1 closed.",
    });

    expect(richJsonToPlainText(improve.narrative)).toBe("");
    expect(improve.correctiveActions).toContain("Intro paragraphs before corrective detail.");
    expect(improve.correctiveActions).toContain("Work order WO-1 closed.");
  });

  it("merges documents reviewed item list", () => {
    const dr = mergeSection("documents_reviewed", { items: ["  a ", "b"] });
    expect(dr.items).toEqual(["a", "b"]);
  });

  it("merges attachment label and description rows", () => {
    const att = mergeSection("attachments", {
      items: [{ label: " Attachment No. I ", description: " Photocopy " }],
    });
    expect(att.items).toEqual([{ label: "Attachment No. I", description: "Photocopy" }]);
  });

  it("preserves nested defaults when merging sparse analyze content", () => {
    const analyze = mergeSection("analyze", {
      sixM: { man: "Training gap" },
    });

    expect(analyze.sixM.man).toBe("Training gap");
    expect(analyze.sixM.machine).toBe("");
    expect(analyze.fiveWhy.narrative).toBe("");
  });

  it("folds legacy root cause level fields into narrative", () => {
    const analyze = mergeAnalyzeSection({
      rootCause: {
        narrative: "Communication failure between HMI and logger.",
        primaryLevel1: "Equipment / Instrument",
        secondaryLevel2: "Not Applicable",
        thirdLevel3: "Not Applicable",
      },
    });

    expect(richJsonToPlainText(analyze.rootCause.narrative)).toContain("Communication failure");
    expect(richJsonToPlainText(analyze.rootCause.narrative)).toContain(
      "Primary (Level 1): Equipment / Instrument"
    );
    expect(analyze.rootCause).not.toHaveProperty("primaryLevel1");
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
    expect(analyze.fiveWhy.narrative).toContain("Weak battery caused the drift.");
    expect(analyze.fiveWhy.conclusion).toBe("");
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
