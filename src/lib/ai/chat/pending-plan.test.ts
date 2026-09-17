import { describe, expect, it } from "vitest";
import { EMPTY_ELR_CONTENT } from "@/lib/document-types/elr/sections";
import {
  CHAT_AUTO_CONTINUE_TEXT,
  advancePlanAfterTurn,
  chatPlanProgressView,
  chatUserTurnIsAutoContinue,
  completedPlanSectionLabel,
  continuationFromMetadata,
  currentPlanTurnSections,
  emptyInventoryNeedsMatchingReview,
  isElrInventoryTableField,
  isMultiSectionDraftRequest,
  isPlanResumeRequest,
  livePlanProgressFromMessages,
  livePlanProgressFromParts,
  parseChatPendingPlan,
  pauseChatPendingPlan,
  persistablePendingPlan,
  planCoverageObjective,
  planKeepsComprehensive,
  planProgressChipLabel,
  planPromptBlock,
  resolvePlanAtTurnStart,
  resolveReviewCoverageObjective,
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
    expect(isMultiSectionDraftRequest("draft remaining report")).toBe(true);
    expect(isMultiSectionDraftRequest("draft the remaining report")).toBe(
      true
    );
    expect(isMultiSectionDraftRequest("Write the remaining ELR")).toBe(true);
    expect(isMultiSectionDraftRequest("complete the rest of the report")).toBe(
      true
    );
    expect(
      isMultiSectionDraftRequest(
        "go on to monitoring and sections after that"
      )
    ).toBe(true);
    expect(
      isMultiSectionDraftRequest("go on to monitoring and the rest")
    ).toBe(true);
    expect(isMultiSectionDraftRequest("Write the Objective")).toBe(false);
    expect(isMultiSectionDraftRequest("draft Purpose")).toBe(false);
    expect(
      isMultiSectionDraftRequest(
        "go on to Qualification and Periodic Re-Qualification History"
      )
    ).toBe(false);
    expect(isMultiSectionDraftRequest("draft first two sections")).toBe(false);
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

  it("seeds a queue on remaining-report phrasing that used to miss", () => {
    const seeded = resolvePlanAtTurnStart({
      existing: null,
      userText: "draft remaining report",
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
    expect(seeded?.objective).toBe("draft remaining report");
  });

  it("does not seed a named single-section draft", () => {
    expect(
      resolvePlanAtTurnStart({
        existing: null,
        userText: "draft Purpose",
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
      })
    ).toBeNull();
  });

  it("seeds on go-on-and-sections-after phrasing that used to miss", () => {
    const seeded = resolvePlanAtTurnStart({
      existing: null,
      userText: "go on to monitoring and sections after that",
      autoContinue: false,
      writeIntent: true,
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_monitoring: EMPTY_ELR_CONTENT.elr_monitoring,
        elr_calibration: EMPTY_ELR_CONTENT.elr_calibration,
        elr_preventive_maintenance:
          EMPTY_ELR_CONTENT.elr_preventive_maintenance,
      },
      promptVersion: "chat-v94-section-plan",
      now: new Date("2026-09-17T04:06:59.000Z"),
    });
    expect(seeded?.items.length).toBeGreaterThanOrEqual(2);
    expect(seeded?.items[0]?.state).toBe("in_progress");
    expect(seeded?.items.slice(1).every((item) => item.state === "queued")).toBe(
      true
    );
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

  it("names the section a remaining-section turn just finished", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "done" },
      {
        sectionKey: "elr_qms",
        label: "QMS Records",
        state: "in_progress",
      },
      { sectionKey: "elr_attachments", label: "Attachments", state: "queued" },
    ]);
    expect(completedPlanSectionLabel(started)).toBe("QMS Records");
    expect(
      completedPlanSectionLabel(started, {
        draftedSectionKeys: ["elr_qms"],
        inFlightSectionKey: null,
      })
    ).toBe("QMS Records");
    expect(
      completedPlanSectionLabel(started, {
        draftedSectionKeys: ["elr_objective", "elr_qms"],
        inFlightSectionKey: null,
      })
    ).toBe("Objective, QMS Records");
    expect(completedPlanSectionLabel(null)).toBeNull();
  });

  it("groups live plan progress into done, current, and pending", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "done" },
      {
        sectionKey: "elr_media_fill",
        label: "Media Fill / Aseptic Process Simulation",
        state: "in_progress",
      },
      {
        sectionKey: "elr_qualification",
        label: "Qualification",
        state: "queued",
      },
    ]);
    const view = chatPlanProgressView(started, "equipment_lifecycle_report");
    expect(view.chipLabel).toBe(
      "2 of 3 — Media Fill / Aseptic Process Simulation"
    );
    expect(view.done.map((item) => item.sectionKey)).toEqual(["elr_objective"]);
    expect(view.current.map((item) => item.sectionKey)).toEqual([
      "elr_media_fill",
    ]);
    expect(view.pending.map((item) => item.sectionKey)).toEqual([
      "elr_qualification",
    ]);
  });

  it("moves the chip when the current turn drafts the next section", () => {
    const started = plan([
      {
        sectionKey: "elr_media_fill",
        label: "Media Fill / Aseptic Process Simulation",
        state: "in_progress",
      },
      {
        sectionKey: "elr_qualification",
        label: "Qualification",
        state: "queued",
      },
      { sectionKey: "elr_calibration", label: "Calibration", state: "queued" },
    ]);
    const live = livePlanProgressFromParts([
      {
        type: "tool-edit_table",
        state: "output-available",
        input: { section: "elr_media_fill" },
      },
      {
        type: "tool-edit_table",
        state: "input-available",
        input: { section: "elr_qualification" },
      },
    ]);
    expect(live).toEqual({
      draftedSectionKeys: ["elr_media_fill"],
      inFlightSectionKey: "elr_qualification",
    });
    const view = chatPlanProgressView(
      started,
      "equipment_lifecycle_report",
      live
    );
    expect(view.chipLabel).toBe("2 of 3 — Qualification");
    expect(view.done.map((item) => item.label)).toEqual([
      "Media Fill / Aseptic Process Simulation",
    ]);
    expect(view.current.map((item) => item.sectionKey)).toEqual([
      "elr_qualification",
    ]);
    expect(view.pending.map((item) => item.sectionKey)).toEqual([
      "elr_calibration",
    ]);
  });

  it("treats a paused queue as pending after the done items", () => {
    const paused = pauseChatPendingPlan(
      plan([
        { sectionKey: "elr_objective", label: "Objective", state: "done" },
        {
          sectionKey: "elr_media_fill",
          label: "Media Fill / Aseptic Process Simulation",
          state: "in_progress",
        },
        {
          sectionKey: "elr_qualification",
          label: "Qualification",
          state: "queued",
        },
      ]),
      "cancelled"
    );
    const view = chatPlanProgressView(paused, "equipment_lifecycle_report");
    expect(view.paused).toBe(true);
    expect(view.chipLabel).toBe(
      "2 of 3 — Media Fill / Aseptic Process Simulation"
    );
    expect(view.current).toEqual([]);
    expect(view.pending.map((item) => item.sectionKey)).toEqual([
      "elr_media_fill",
      "elr_qualification",
    ]);
    expect(view.complete).toBe(false);
  });

  it("marks the chip complete when live drafts cover every remaining section", () => {
    const started = plan([
      { sectionKey: "elr_objective", label: "Objective", state: "done" },
      {
        sectionKey: "elr_conclusion",
        label: "Summary, Conclusion and Recommendation",
        state: "in_progress",
      },
    ]);
    const live = livePlanProgressFromParts([
      {
        type: "tool-draft_field",
        state: "output-available",
        input: { section: "elr_conclusion" },
      },
    ]);
    const view = chatPlanProgressView(
      started,
      "equipment_lifecycle_report",
      live
    );
    expect(view.complete).toBe(true);
    expect(view.chipLabel).toBe("2 of 2 — done");
    expect(view.current).toEqual([]);
    expect(view.pending).toEqual([]);
  });

  it("does not keep a cancelled section in progress when a tool is still in flight", () => {
    const paused = pauseChatPendingPlan(
      plan([
        {
          sectionKey: "elr_media_fill",
          label: "Media Fill / Aseptic Process Simulation",
          state: "in_progress",
        },
      ]),
      "cancelled"
    );
    const live = livePlanProgressFromParts([
      {
        type: "tool-edit_table",
        state: "input-available",
        input: { section: "elr_media_fill" },
      },
    ]);
    const view = chatPlanProgressView(
      paused,
      "equipment_lifecycle_report",
      live
    );
    expect(view.paused).toBe(true);
    expect(view.complete).toBe(false);
    expect(view.current).toEqual([]);
    expect(view.pending.map((item) => item.sectionKey)).toEqual([
      "elr_media_fill",
    ]);
  });

  it("keeps drafted keys after a wrap-up assistant row with no edit tools", () => {
    const live = livePlanProgressFromMessages([
      {
        role: "assistant",
        parts: [
          {
            type: "tool-draft_field",
            state: "output-available",
            input: { section: "elr_objective" },
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-draft_field",
            state: "output-available",
            input: { section: "elr_conclusion" },
          },
        ],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Remaining sections are drafted." }],
      },
    ]);
    expect(live).toEqual({
      draftedSectionKeys: ["elr_objective", "elr_conclusion"],
      inFlightSectionKey: null,
    });
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
        "Continue the remaining sections.",
        { documentType: "equipment_lifecycle_report" }
      )
    ).toBe("elr_calibration");
    expect(planCoverageObjective(null, "Fill monitoring from the certificates", {
      documentType: "equipment_lifecycle_report",
    })).toBe("elr_monitoring");
  });

  it("stamps the section being drafted, not a leftover plan pointer", () => {
    expect(
      planCoverageObjective(
        plan([
          {
            sectionKey: "elr_system_description",
            label: "System Description",
            state: "in_progress",
          },
        ]),
        "go on to fill Media Fill / Aseptic Process Simulation",
        { documentType: "equipment_lifecycle_report" }
      )
    ).toBe("elr_media_fill");
    expect(
      planCoverageObjective(
        plan([
          {
            sectionKey: "elr_system_description",
            label: "System Description",
            state: "in_progress",
          },
        ]),
        "Continue the remaining sections.",
        {
          documentType: "equipment_lifecycle_report",
          sectionScope: "elr_qualification",
        }
      )
    ).toBe("elr_qualification");
  });

  it("prefers a section-key route objective over user text when starting a review", () => {
    expect(
      resolveReviewCoverageObjective({
        routeObjective: "elr_calibration",
        toolObjective: "every attached record",
        documentType: "equipment_lifecycle_report",
      })
    ).toBe("elr_calibration");
    expect(
      resolveReviewCoverageObjective({
        routeObjective: "draft remaining report",
        toolObjective: "calibration certificates",
        documentType: "equipment_lifecycle_report",
      })
    ).toBe("calibration certificates");
    expect(
      resolveReviewCoverageObjective({
        routeObjective: "elr_system_description",
        toolObjective: "every attached record",
        documentType: "equipment_lifecycle_report",
        userText: "fill Qualification history",
      })
    ).toBe("elr_qualification");
  });

  it("refuses draft_field only for ELR inventory tables, not DV Results", () => {
    expect(
      isElrInventoryTableField(
        "equipment_lifecycle_report",
        "elr_calibration",
        "table"
      )
    ).toBe(true);
    expect(
      isElrInventoryTableField(
        "design_verification",
        "results_and_discussions",
        "table"
      )
    ).toBe(false);
    expect(
      isElrInventoryTableField(
        "equipment_lifecycle_report",
        "elr_objective",
        "narrative"
      )
    ).toBe(false);
  });

  it("needs a matching review only while an ELR inventory table is still empty", () => {
    expect(
      emptyInventoryNeedsMatchingReview({
        documentType: "equipment_lifecycle_report",
        section: "elr_calibration",
        content: EMPTY_ELR_CONTENT.elr_calibration,
        finishedCoverageKey: "att:10:run|obj:elr_qualification",
      })
    ).toBe(true);
    expect(
      emptyInventoryNeedsMatchingReview({
        documentType: "equipment_lifecycle_report",
        section: "elr_calibration",
        content: EMPTY_ELR_CONTENT.elr_calibration,
        finishedCoverageKey: "att:10:run|obj:elr_calibration",
      })
    ).toBe(false);
    expect(
      emptyInventoryNeedsMatchingReview({
        documentType: "equipment_lifecycle_report",
        section: "elr_objective",
        content: EMPTY_ELR_CONTENT.elr_objective,
        finishedCoverageKey: null,
      })
    ).toBe(false);
  });

  it("keeps comprehensive retrieval for a queued inventory section", () => {
    expect(
      planKeepsComprehensive(
        plan([
          {
            sectionKey: "elr_calibration",
            label: "Associated instruments",
            state: "in_progress",
          },
        ]),
        "equipment_lifecycle_report"
      )
    ).toBe(true);
    expect(
      planKeepsComprehensive(
        plan([
          { sectionKey: "elr_objective", label: "Objective", state: "in_progress" },
        ]),
        "equipment_lifecycle_report"
      )
    ).toBe(false);
  });
});
