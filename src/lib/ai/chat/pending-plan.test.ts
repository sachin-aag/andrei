import { describe, expect, it } from "vitest";
import {
  CHAT_AUTO_CONTINUE_TEXT,
  advancePlanAfterTurn,
  chatUserTurnIsAutoContinue,
  continuationFromMetadata,
  currentPlanTurnSections,
  isMultiSectionDraftRequest,
  isPlanResumeRequest,
  parseChatPendingPlan,
  pauseChatPendingPlan,
  persistablePendingPlan,
  planCoverageObjective,
  planProgressChipLabel,
  planPromptBlock,
  resolvePlanAtTurnStart,
  resumeChatPendingPlan,
  seedSectionQueuePlan,
  shouldAutoContinuePlan,
  type ChatPendingPlan,
} from "./pending-plan";

const emptyNarrative = { narrative: { type: "doc", content: [] } };

function plan(items: ChatPendingPlan["items"]): ChatPendingPlan {
  return {
    kind: "section_queue",
    objective: "Draft the remaining sections",
    items,
    createdAt: "2026-09-14T00:00:00.000Z",
    promptVersion: "chat-v94-section-plan",
  };
}

describe("multi-section draft detection", () => {
  it("matches remaining-section and whole-report phrasing", () => {
    expect(isMultiSectionDraftRequest("Draft the remaining sections")).toBe(
      true
    );
    expect(isMultiSectionDraftRequest("Fill in the report from the PDFs")).toBe(
      true
    );
    expect(isMultiSectionDraftRequest("Write the Objective")).toBe(false);
  });

  it("treats continue/resume as a plan resume, not a new queue", () => {
    expect(isPlanResumeRequest(CHAT_AUTO_CONTINUE_TEXT)).toBe(true);
    expect(isPlanResumeRequest("keep going")).toBe(true);
    expect(isPlanResumeRequest("Draft Purpose")).toBe(false);
  });
});

describe("seedSectionQueuePlan", () => {
  it("queues empty draft-order sections and starts the first", () => {
    const seeded = seedSectionQueuePlan({
      userText: "Draft the remaining sections",
      documentType: "investigation_report",
      sections: {
        define: emptyNarrative,
        measure: emptyNarrative,
      },
      promptVersion: "chat-v94-section-plan",
      now: new Date("2026-09-14T00:00:00.000Z"),
    });
    expect(seeded?.items.length).toBeGreaterThanOrEqual(2);
    expect(seeded?.items[0]?.state).toBe("in_progress");
    expect(seeded?.items.slice(1).every((item) => item.state === "queued")).toBe(
      true
    );
  });

  it("does not seed a one-section leftover", () => {
    expect(
      seedSectionQueuePlan({
        userText: "Draft the remaining sections",
        documentType: "generic_document",
        sections: { body: emptyNarrative },
        promptVersion: "chat-v94-section-plan",
      })
    ).toBeNull();
  });
});

describe("advancePlanAfterTurn", () => {
  it("marks drafted items done and stamps a continuation", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "in_progress" },
      { sectionKey: "elr_scope", label: "Scope", state: "queued" },
      { sectionKey: "elr_calibration", label: "Calibration", state: "queued" },
    ]);
    const result = advancePlanAfterTurn({
      plan: started,
      documentType: "equipment_lifecycle_report",
      draftedSectionKeys: ["elr_objective", "elr_scope"],
    });
    expect(result.progressed).toBe(true);
    expect(result.plan.items[0]?.state).toBe("done");
    expect(result.plan.items[1]?.state).toBe("done");
    expect(result.plan.items[2]?.state).toBe("in_progress");
    expect(result.continuation).toEqual({
      remaining: 1,
      nextLabel: "Calibration",
      itemIndex: 3,
      total: 3,
    });
    expect(shouldAutoContinuePlan(result.continuation)).toBe(true);
  });

  it("keeps an inventory section in progress when only review tools ran", () => {
    const started = plan([
      {
        sectionKey: "elr_calibration",
        label: "Calibration",
        state: "in_progress",
      },
      { sectionKey: "elr_monitoring", label: "Monitoring", state: "queued" },
    ]);
    const result = advancePlanAfterTurn({
      plan: started,
      documentType: "equipment_lifecycle_report",
      draftedSectionKeys: [],
      parts: [{ type: "tool-continue_document_review" }],
    });
    expect(result.progressed).toBe(true);
    expect(result.plan.items[0]?.state).toBe("in_progress");
    expect(result.continuation?.remaining).toBe(2);
    expect(result.plan.paused).toBeFalsy();
  });

  it("pauses when the turn made no edits and did not review", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "in_progress" },
      { sectionKey: "elr_scope", label: "Scope", state: "queued" },
    ]);
    const result = advancePlanAfterTurn({
      plan: started,
      documentType: "equipment_lifecycle_report",
      draftedSectionKeys: [],
      parts: [{ type: "text", text: "I need more files." }],
    });
    expect(result.progressed).toBe(false);
    expect(result.continuation).toBeNull();
    expect(result.plan.paused).toBe(true);
    expect(result.plan.pauseReason).toBe("no_progress");
    expect(shouldAutoContinuePlan(null)).toBe(false);
  });

  it("pairs empty non-inventory sections on one turn", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "in_progress" },
      { sectionKey: "elr_scope", label: "Scope", state: "queued" },
      {
        sectionKey: "elr_qualification",
        label: "Qualification",
        state: "queued",
      },
    ]);
    expect(
      currentPlanTurnSections(started, "equipment_lifecycle_report").map(
        (item) => item.sectionKey
      )
    ).toEqual(["elr_objective", "elr_scope"]);
  });
});

describe("resolvePlanAtTurnStart", () => {
  it("seeds a queue on a multi-section write and keeps auto-continue on the same plan", () => {
    const seeded = resolvePlanAtTurnStart({
      existing: null,
      userText: "Draft the remaining sections from the attachments",
      autoContinue: false,
      writeIntent: true,
      documentType: "investigation_report",
      sections: {
        define: emptyNarrative,
        measure: emptyNarrative,
        analyze: emptyNarrative,
      },
      promptVersion: "chat-v94-section-plan",
      now: new Date("2026-09-14T00:00:00.000Z"),
    });
    expect(seeded?.items.length).toBeGreaterThanOrEqual(2);
    expect(
      resolvePlanAtTurnStart({
        existing: seeded,
        userText: CHAT_AUTO_CONTINUE_TEXT,
        autoContinue: true,
        writeIntent: true,
        documentType: "investigation_report",
        sections: {},
        promptVersion: "chat-v94-section-plan",
      })
    ).toBe(seeded);
  });

  it("pauses an active plan when the engineer types a new prompt", () => {
    const started = plan([
      { sectionKey: "define", label: "Define", state: "in_progress" },
      { sectionKey: "measure", label: "Measure", state: "queued" },
    ]);
    const next = resolvePlanAtTurnStart({
      existing: started,
      userText: "Rewrite Define only",
      autoContinue: false,
      writeIntent: true,
      documentType: "investigation_report",
      sections: {},
      promptVersion: "chat-v94-section-plan",
    });
    expect(next?.paused).toBe(true);
    expect(next?.pauseReason).toBe("new_user_message");
    expect(persistablePendingPlan(started)).toBe(started);
    expect(
      persistablePendingPlan(
        plan([{ sectionKey: "define", label: "Define", state: "done" }])
      )
    ).toBeNull();
  });
});

describe("pause and resume", () => {
  it("pauses in-progress work and resumes the first remaining item", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "done" },
      { sectionKey: "elr_scope", label: "Scope", state: "in_progress" },
    ]);
    const paused = pauseChatPendingPlan(started, "cancelled");
    expect(paused.paused).toBe(true);
    expect(paused.items[1]?.state).toBe("queued");
    const resumed = resumeChatPendingPlan(paused);
    expect(resumed?.paused).toBe(false);
    expect(resumed?.items[1]?.state).toBe("in_progress");
  });
});

describe("plan prompt and metadata", () => {
  it("tells the model to draft only the current item", () => {
    const block = planPromptBlock(
      plan([
        {
          sectionKey: "elr_calibration",
          label: "Calibration",
          state: "in_progress",
        },
        { sectionKey: "elr_monitoring", label: "Monitoring", state: "queued" },
      ]),
      "equipment_lifecycle_report"
    );
    expect(block).toContain("This turn: **Calibration**");
    expect(block).toContain("Do not start Monitoring");
  });

  it("reads continuation and autoContinue from message metadata", () => {
    expect(
      continuationFromMetadata({
        continuation: {
          remaining: 3,
          nextLabel: "Monitoring",
          itemIndex: 4,
          total: 10,
        },
      })
    ).toEqual({
      remaining: 3,
      nextLabel: "Monitoring",
      itemIndex: 4,
      total: 10,
    });
    expect(chatUserTurnIsAutoContinue({ autoContinue: true })).toBe(true);
    expect(chatUserTurnIsAutoContinue({ chatTarget: "report" })).toBe(false);
    expect(shouldAutoContinuePlan({ remaining: 1, nextLabel: "A", itemIndex: 2, total: 3 }, { cancelled: true })).toBe(false);
    expect(
      planProgressChipLabel({
        remaining: 3,
        nextLabel: "Monitoring",
        itemIndex: 4,
        total: 10,
      })
    ).toBe("4 of 10 — Monitoring");
  });

  it("rejects malformed plan JSON", () => {
    expect(parseChatPendingPlan({ kind: "section_queue" })).toBeNull();
    expect(
      parseChatPendingPlan({
        kind: "section_queue",
        objective: "x",
        createdAt: "t",
        promptVersion: "v",
        items: [{ sectionKey: "define", label: "Define", state: "queued" }],
      })?.items[0]?.sectionKey
    ).toBe("define");
  });

  it("uses the in-progress section as the review coverage objective", () => {
    expect(
      planCoverageObjective(
        plan([
          { sectionKey: "elr_calibration", label: "Calibration", state: "in_progress" },
          { sectionKey: "elr_monitoring", label: "Monitoring", state: "queued" },
        ]),
        "Continue the remaining sections."
      )
    ).toBe("elr_calibration");
    expect(planCoverageObjective(null, "Fill monitoring from the certificates")).toBe(
      "Fill monitoring from the certificates"
    );
  });
});
