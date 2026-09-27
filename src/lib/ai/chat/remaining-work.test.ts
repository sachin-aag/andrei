import { describe, expect, it } from "vitest";
import type { ChatPendingPlan } from "@/lib/ai/chat/pending-plan";
import { searchLoopHideKind, type SearchLoopStep } from "@/lib/ai/chat/search-loop";
import {
  applyRemainingWorkEvents,
  applyStepsToLivingTurnWork,
  applyUpdatePlanAction,
  cloneLivingTurnWork,
  documentWriteProgressTools,
  emptyDraftOrderKeys,
  livingWorkKeepsSearchOpen,
  mergeLivingWorkIntoPendingPlan,
  remainingWorkEventsFromSteps,
  remainingWorkPromptBlock,
  seedLivingTurnWork,
  UPDATE_PLAN_ATTEMPT_LIMIT,
  UPDATE_PLAN_SUCCESS_LIMIT,
  UPDATE_PLAN_TOOL,
  updatePlanLoopDirective,
  type LivingTurnWork,
  type RemainingWorkContext,
} from "./remaining-work";

function plan(items: ChatPendingPlan["items"]): ChatPendingPlan {
  return {
    kind: "section_queue",
    objective: "Draft the remaining sections",
    items,
    createdAt: "2026-09-27T00:00:00.000Z",
    promptVersion: "chat-v145-living-remaining-work",
  };
}

function ctx(
  overrides: Partial<RemainingWorkContext> = {}
): RemainingWorkContext {
  return {
    surface: "document",
    documentType: "investigation_report",
    emptySectionKeys: ["define", "measure", "analyze"],
    queueLive: true,
    writeToolNames: documentWriteProgressTools(),
    ...overrides,
  };
}

function searchHit(hits: number, id = "s1"): SearchLoopStep {
  return {
    toolCalls: [{ toolName: "search_documents", toolCallId: id }],
    toolResults: [
      {
        toolName: "search_documents",
        toolCallId: id,
        output: { returnedCount: hits, results: hits > 0 ? [{}] : [] },
      },
    ],
  };
}

function draftStep(section: string): SearchLoopStep {
  return {
    toolCalls: [
      {
        toolName: "draft_field",
        toolCallId: "d1",
        input: { section, targetField: "narrative" },
      },
    ],
    toolResults: [
      {
        toolName: "draft_field",
        toolCallId: "d1",
        output: { status: "drafted", section },
      },
    ],
  };
}

function updatePlanStep(
  action: "skip" | "add_section",
  sectionKey: string,
  status: "updated" | "rejected"
): SearchLoopStep {
  return {
    toolCalls: [
      {
        toolName: UPDATE_PLAN_TOOL,
        toolCallId: "u1",
        input: { action, sectionKey, reason: "files show N/A" },
      },
    ],
    toolResults: [
      {
        toolName: UPDATE_PLAN_TOOL,
        toolCallId: "u1",
        output: { status, action, sectionKey },
      },
    ],
  };
}

describe("seedLivingTurnWork", () => {
  it("freezes social as empty work with no lookups", () => {
    const work = seedLivingTurnWork({
      intent: "social",
      alsoLookup: true,
      pendingPlan: plan([
        { sectionKey: "define", label: "Define", state: "in_progress" },
      ]),
    });
    expect(work.writeOutstanding).toBe(false);
    expect(work.items).toEqual([]);
  });

  it("seeds queue items and a kickoff lookup without growing from retrieval", () => {
    const work = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
      pendingPlan: plan([
        { sectionKey: "define", label: "Define", state: "in_progress" },
        { sectionKey: "measure", label: "Measure", state: "queued" },
        { sectionKey: "analyze", label: "Analyze", state: "done" },
        { sectionKey: "improve", label: "Improve", state: "skipped" },
      ]),
    });
    expect(work.writeOutstanding).toBe(true);
    expect(work.items.map((item) => `${item.kind}:${item.key}:${item.state}`)).toEqual([
      "section:define:in_progress",
      "section:measure:queued",
      "lookup:also_lookup:queued",
    ]);
  });
});

describe("applyUpdatePlanAction", () => {
  const queued: LivingTurnWork = {
    intent: "write",
    alsoLookup: false,
    writeOutstanding: true,
    items: [
      {
        id: "section:define",
        kind: "section",
        key: "define",
        label: "Define",
        state: "in_progress",
        source: "pending_plan",
      },
      {
        id: "section:measure",
        kind: "section",
        key: "measure",
        label: "Measure",
        state: "queued",
        source: "pending_plan",
      },
    ],
  };

  it("skips only queued sections", () => {
    const skipped = applyUpdatePlanAction(
      queued,
      { action: "skip", sectionKey: "measure", reason: "no measure data" },
      ctx()
    );
    expect(skipped.status).toBe("updated");
    if (skipped.status !== "updated") return;
    expect(skipped.item.state).toBe("skipped");
    expect(queued.items[1]?.state).toBe("queued");
  });

  it("refuses to skip the in-progress section so the model asks instead", () => {
    expect(
      applyUpdatePlanAction(
        queued,
        { action: "skip", sectionKey: "define", reason: "not this" },
        ctx()
      )
    ).toMatchObject({ status: "rejected", reason: "skip_in_progress" });
  });

  it("adds only empty draftOrder keys", () => {
    const added = applyUpdatePlanAction(
      queued,
      { action: "add_section", sectionKey: "analyze", reason: "still empty" },
      ctx()
    );
    expect(added.status).toBe("updated");
    expect(
      applyUpdatePlanAction(
        queued,
        { action: "add_section", sectionKey: "conclusion", reason: "filled" },
        ctx()
      )
    ).toMatchObject({ status: "rejected", reason: "add_not_empty" });
  });

  it("does not rewrite a greeting or an Analytics turn", () => {
    expect(
      applyUpdatePlanAction(
        { ...queued, intent: "social" },
        { action: "skip", sectionKey: "measure", reason: "x" },
        ctx()
      )
    ).toMatchObject({ status: "rejected", reason: "social" });
    expect(
      applyUpdatePlanAction(
        queued,
        { action: "skip", sectionKey: "measure", reason: "x" },
        ctx({ surface: "analytics" })
      )
    ).toMatchObject({ status: "rejected", reason: "analytics_forbidden" });
  });
});

describe("applyStepsToLivingTurnWork", () => {
  it("marks a landed draft done without an update_plan call", () => {
    const seed = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
      pendingPlan: plan([
        { sectionKey: "define", label: "Define", state: "in_progress" },
        { sectionKey: "measure", label: "Measure", state: "queued" },
      ]),
    });
    const next = applyStepsToLivingTurnWork(seed, [draftStep("define")], ctx());
    expect(next.writeOutstanding).toBe(false);
    expect(next.items.find((item) => item.key === "define")?.state).toBe("done");
    expect(next.items.find((item) => item.kind === "lookup")?.state).toBe(
      "queued"
    );
  });

  it("does not treat a cited search hit as completing the follow-up", () => {
    const seed = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
    });
    const next = applyStepsToLivingTurnWork(seed, [searchHit(3)], ctx());
    expect(next.writeOutstanding).toBe(true);
    expect(next.items.find((item) => item.kind === "lookup")?.state).toBe(
      "queued"
    );
  });
});

describe("livingWorkKeepsSearchOpen", () => {
  it("keeps search after a cited hit only while the write is still outstanding", () => {
    const seed = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
    });
    expect(livingWorkKeepsSearchOpen(seed, "cited_or_locate")).toBe(true);
    expect(livingWorkKeepsSearchOpen(seed, "empty_limit")).toBe(false);
    const afterDraft = applyStepsToLivingTurnWork(
      seed,
      [searchHit(3), draftStep("define")],
      ctx()
    );
    expect(afterDraft.writeOutstanding).toBe(false);
    expect(livingWorkKeepsSearchOpen(afterDraft, "cited_or_locate")).toBe(
      false
    );
  });

  it("never keeps search on a greeting", () => {
    const work = seedLivingTurnWork({ intent: "social", alsoLookup: true });
    expect(livingWorkKeepsSearchOpen(work, "cited_or_locate")).toBe(false);
  });
});

describe("updatePlanLoopDirective", () => {
  it("hides after one success so the orchestrator cannot rewrite the queue every step", () => {
    expect(UPDATE_PLAN_SUCCESS_LIMIT).toBe(1);
    expect(UPDATE_PLAN_ATTEMPT_LIMIT).toBe(2);
    expect(
      updatePlanLoopDirective([
        updatePlanStep("skip", "measure", "updated"),
      ])
    ).toBe("hide");
  });

  it("hides after two rejected attempts and after ask_user", () => {
    expect(
      updatePlanLoopDirective([
        updatePlanStep("skip", "define", "rejected"),
        updatePlanStep("skip", "measure", "rejected"),
      ])
    ).toBe("hide");
    expect(
      updatePlanLoopDirective([
        {
          toolCalls: [{ toolName: "ask_user", toolCallId: "a1" }],
          toolResults: [
            {
              toolName: "ask_user",
              toolCallId: "a1",
              output: { status: "awaiting_answers" },
            },
          ],
        },
      ])
    ).toBe("hide");
  });
});

describe("mergeLivingWorkIntoPendingPlan", () => {
  it("persists a skip onto the queued item and appends an added section", () => {
    const pending = plan([
      { sectionKey: "define", label: "Define", state: "in_progress" },
      { sectionKey: "measure", label: "Measure", state: "queued" },
    ]);
    const seed = seedLivingTurnWork({
      intent: "write",
      alsoLookup: false,
      pendingPlan: pending,
    });
    const skipped = applyUpdatePlanAction(
      seed,
      { action: "skip", sectionKey: "measure", reason: "N/A" },
      ctx()
    );
    if (skipped.status !== "updated") throw new Error("expected skip");
    const added = applyUpdatePlanAction(
      skipped.work,
      { action: "add_section", sectionKey: "analyze", reason: "still empty" },
      ctx()
    );
    if (added.status !== "updated") throw new Error("expected add");
    const merged = mergeLivingWorkIntoPendingPlan(pending, added.work);
    expect(merged?.items.map((item) => `${item.sectionKey}:${item.state}`)).toEqual([
      "define:in_progress",
      "measure:skipped",
      "analyze:queued",
    ]);
  });

  it("does not invent a remaining-section queue when none exists", () => {
    const work = seedLivingTurnWork({ intent: "write", alsoLookup: true });
    expect(mergeLivingWorkIntoPendingPlan(null, work)).toBeNull();
  });
});

describe("remainingWorkPromptBlock", () => {
  it("tells the model to ask instead of looping update_plan", () => {
    const work = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
      pendingPlan: plan([
        { sectionKey: "define", label: "Define", state: "in_progress" },
      ]),
    });
    const block = remainingWorkPromptBlock(work, { queueLive: true });
    expect(block).toContain("update_plan at most once");
    expect(block).toContain("ask_user once");
    expect(block).toContain("Do not add lookups");
  });

  it("does not offer update_plan on Analytics", () => {
    const work = seedLivingTurnWork({ intent: "write", alsoLookup: true });
    const block = remainingWorkPromptBlock(work, {
      queueLive: false,
      surface: "analytics",
    });
    expect(block).toContain("Do not rewrite a remaining-work list");
    expect(block).toContain("two empty greps still stop search");
    expect(block).not.toContain("Call update_plan");
  });
});

describe("emptyDraftOrderKeys", () => {
  it("lists empty investigation draftOrder keys", () => {
    const keys = emptyDraftOrderKeys("investigation_report", {
      define: { narrative: { type: "doc", content: [] } },
    });
    expect(keys).toContain("define");
  });
});

describe("searchLoopHideKind", () => {
  it("names cited hits separately from the empty-grep bound", () => {
    expect(searchLoopHideKind([searchHit(3)])).toBe("cited_or_locate");
    expect(searchLoopHideKind([searchHit(0), searchHit(0, "s2")])).toBe(
      "empty_limit"
    );
  });
});

describe("remainingWorkEventsFromSteps", () => {
  it("pairs update_plan input with the tool result", () => {
    const events = remainingWorkEventsFromSteps([
      updatePlanStep("skip", "measure", "updated"),
    ]);
    expect(events[0]).toMatchObject({
      toolName: UPDATE_PLAN_TOOL,
      input: { action: "skip", sectionKey: "measure" },
      output: { status: "updated" },
    });
  });
});

describe("applyRemainingWorkEvents", () => {
  it("replays a successful skip from the tool result", () => {
    const seed = seedLivingTurnWork({
      intent: "write",
      alsoLookup: false,
      pendingPlan: plan([
        { sectionKey: "define", label: "Define", state: "in_progress" },
        { sectionKey: "measure", label: "Measure", state: "queued" },
      ]),
    });
    const next = applyRemainingWorkEvents(
      seed,
      remainingWorkEventsFromSteps([updatePlanStep("skip", "measure", "updated")]),
      ctx()
    );
    expect(next.items.find((item) => item.key === "measure")?.state).toBe(
      "skipped"
    );
  });
});

describe("cloneLivingTurnWork", () => {
  it("does not share item references", () => {
    const work = seedLivingTurnWork({
      intent: "write",
      alsoLookup: true,
    });
    const copy = cloneLivingTurnWork(work);
    copy.items[0]!.state = "done";
    expect(work.items[0]?.state).toBe("queued");
  });
});
