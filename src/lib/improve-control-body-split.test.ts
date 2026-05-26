import { describe, expect, it } from "vitest";
import {
  splitControlUnifiedText,
  splitImproveUnifiedText,
} from "@/lib/improve-control-body-split";

describe("splitImproveUnifiedText", () => {
  it("puts checklist in checkpoints and narrative after Corrective Action label", () => {
    const improveQ3 =
      "3. Is the Corrective action assigned a unique number, responsible person and due date so it can be tracked?";
    const unified = [
      "Improve: Improve section covers the corrective actions",
      "Following checkpoint shall be considered as guidance only,",
      improveQ3,
      "4. Are the identified corrective actions achievable based on the information provided?",
      "",
      "Corrective Action:",
      "The investigation has been driven through the DMAIC methodology.",
    ].join("\n");

    const { checkpoints, correctiveAction } = splitImproveUnifiedText(unified);

    expect(checkpoints).toContain("Improve section covers the corrective actions");
    expect(checkpoints).toContain(improveQ3);
    expect(checkpoints).not.toContain("DMAIC methodology");
    expect(correctiveAction).toContain("DMAIC methodology");
    expect(correctiveAction).not.toContain("Improve section covers");
  });
});

describe("splitControlUnifiedText", () => {
  it("puts checklist in checkpoints and narrative after Preventive Action label", () => {
    const unified = [
      "Control: Control section covers the preventive actions",
      "Following checkpoint shall be considered as guidance only,",
      "1. Is specific Preventive Actions identified for each root cause?",
      "4. Is an Interim Plan needed to ensure a state the control while the Preventive Actions were implemented?",
      "",
      "Preventive Action:",
      "The investigation has been carried out through 5 Why methodology.",
    ].join("\n");

    const { checkpoints, preventiveAction } = splitControlUnifiedText(unified);

    expect(checkpoints).toContain("Control section covers the preventive actions");
    expect(checkpoints).toContain("Interim Plan needed");
    expect(checkpoints).not.toContain("5 Why methodology");
    expect(preventiveAction).toContain("5 Why methodology");
    expect(preventiveAction).not.toContain("Control section covers");
  });
});
