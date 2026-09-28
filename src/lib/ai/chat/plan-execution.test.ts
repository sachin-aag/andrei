import { describe, expect, it } from "vitest";
import {
  isDependentRecapSection,
  planExecutionMode,
  recapWriteNotReady,
  shouldPairPlanSections,
} from "./plan-execution";

describe("plan execution", () => {
  it("treats the last conclusion as a dependent recap and leaves QRA pre-conclusion mid-document", () => {
    expect(isDependentRecapSection("qsr_conclusion", "qualification_summary_report")).toBe(
      true
    );
    expect(isDependentRecapSection("qsr_objective", "qualification_summary_report")).toBe(
      false
    );
    expect(isDependentRecapSection("conclusion", "investigation_report")).toBe(true);
    expect(isDependentRecapSection("qra_pre_conclusion", "quality_risk_assessment")).toBe(
      false
    );
    expect(isDependentRecapSection("qra_post_conclusion", "quality_risk_assessment")).toBe(
      true
    );
  });

  it("queues while a recap still has earlier work and pairs a pure RTM family", () => {
    expect(
      planExecutionMode(
        [
          { sectionKey: "qsr_objective", label: "1.1", state: "queued" },
          { sectionKey: "qsr_conclusion", label: "7", state: "queued" },
        ],
        "qualification_summary_report"
      )
    ).toBe("queue");
    expect(
      planExecutionMode(
        [
          { sectionKey: "qsr_rtm_process", label: "5.1", state: "in_progress" },
          { sectionKey: "qsr_rtm_control", label: "5.2", state: "queued" },
        ],
        "qualification_summary_report"
      )
    ).toBe("independent");
    expect(
      shouldPairPlanSections(
        "qsr_rtm_process",
        "qsr_rtm_control",
        "qualification_summary_report"
      )
    ).toBe(true);
    expect(
      shouldPairPlanSections(
        "qsr_other_details",
        "qsr_conclusion",
        "qualification_summary_report"
      )
    ).toBe(false);
  });

  it("refuses a conclusion draft while earlier empty sections remain", () => {
    const blocked = recapWriteNotReady({
      section: "qsr_conclusion",
      documentType: "qualification_summary_report",
      emptySectionKeys: ["qsr_objective", "qsr_conclusion"],
      namedSectionKeys: [],
    });
    expect(blocked?.message).toMatch(/Objective/i);

    expect(
      recapWriteNotReady({
        section: "qsr_conclusion",
        documentType: "qualification_summary_report",
        emptySectionKeys: ["qsr_objective", "qsr_conclusion"],
        namedSectionKeys: ["qsr_conclusion"],
      })
    ).toBeNull();

    expect(
      recapWriteNotReady({
        section: "qsr_conclusion",
        documentType: "qualification_summary_report",
        emptySectionKeys: ["qsr_objective", "qsr_conclusion"],
        namedSectionKeys: ["qsr_objective", "qsr_conclusion"],
        plan: {
          items: [
            { sectionKey: "qsr_objective", label: "1.1 Objective", state: "in_progress" },
            { sectionKey: "qsr_conclusion", label: "7 Conclusion", state: "queued" },
          ],
        },
        planTurnKeys: ["qsr_objective"],
      })?.message
    ).toMatch(/1\.1 Objective/);

    expect(
      recapWriteNotReady({
        section: "qsr_conclusion",
        documentType: "qualification_summary_report",
        emptySectionKeys: ["qsr_conclusion"],
        namedSectionKeys: ["qsr_objective", "qsr_conclusion"],
        plan: {
          items: [
            { sectionKey: "qsr_conclusion", label: "7 Conclusion", state: "in_progress" },
          ],
        },
        planTurnKeys: ["qsr_conclusion"],
      })
    ).toBeNull();
  });
});
