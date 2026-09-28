import { describe, expect, it } from "vitest";
import {
  looksMultiStepAsk,
  MAKE_PLAN_MAX_STEPS,
  makePlanEligible,
  parseMakePlanInput,
  validateMakePlan,
  type MakePlanContext,
} from "./task-plan";

const ctx: MakePlanContext = {
  documentType: "investigation_report",
  planLive: false,
  promptVersion: "chat-test",
  now: new Date("2026-09-28T00:00:00.000Z"),
};

describe("validateMakePlan", () => {
  it("turns section steps into a section queue and keeps lookups in-turn", () => {
    const result = validateMakePlan(
      {
        objective: "Draft define and measure, and find the batch number",
        steps: [
          { kind: "lookup", question: "What is the batch number?" },
          { kind: "section", section: "define" },
          { kind: "section", section: "measure" },
        ],
      },
      ctx
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan).toMatchObject({
      kind: "section_queue",
      source: "make_plan",
      promptVersion: "chat-test",
      createdAt: "2026-09-28T00:00:00.000Z",
    });
    expect(result.plan.items.map((item) => [item.sectionKey, item.state])).toEqual([
      ["define", "in_progress"],
      ["measure", "queued"],
    ]);
    expect(result.lookups).toEqual(["What is the batch number?"]);
  });

  it("moves a terminal conclusion last and keeps other orchestrator order", () => {
    const result = validateMakePlan(
      {
        objective: "Draft the report, conclusion first",
        steps: [
          { kind: "section", section: "qsr_conclusion" },
          { kind: "section", section: "qsr_objective" },
          { kind: "section", section: "qsr_scope" },
        ],
      },
      {
        ...ctx,
        documentType: "qualification_summary_report",
      }
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.items.map((item) => item.sectionKey)).toEqual([
      "qsr_objective",
      "qsr_scope",
      "qsr_conclusion",
    ]);
    expect(result.plan.items[0]?.state).toBe("in_progress");
  });

  it("keeps the step order the orchestrator chose, not draftOrder", () => {
    const result = validateMakePlan(
      {
        objective: "Measure first, then define",
        steps: [
          { kind: "section", section: "measure" },
          { kind: "section", section: "define" },
        ],
      },
      ctx
    );
    expect(result.status === "planned" && result.plan.items[0]?.sectionKey).toBe(
      "measure"
    );
  });

  it("rejects when a plan is already live", () => {
    const result = validateMakePlan(
      {
        objective: "x",
        steps: [
          { kind: "section", section: "define" },
          { kind: "section", section: "measure" },
        ],
      },
      { ...ctx, planLive: true }
    );
    expect(result).toMatchObject({ status: "rejected", reason: "plan_live" });
  });

  it.each([
    [[{ kind: "section" as const, section: "define" }], "too_few_steps"],
    [
      Array.from({ length: MAKE_PLAN_MAX_STEPS + 1 }, () => ({
        kind: "lookup" as const,
        question: "q",
      })),
      "too_many_steps",
    ],
    [
      [
        { kind: "lookup" as const, question: "a" },
        { kind: "lookup" as const, question: "b" },
      ],
      "no_section_step",
    ],
    [
      [
        { kind: "section" as const, section: "define" },
        { kind: "section" as const, section: "define" },
      ],
      "duplicate_section",
    ],
    [
      [
        { kind: "section" as const, section: "define" },
        { kind: "section" as const, section: "elr_media_fill" },
      ],
      "section_not_editable",
    ],
    [
      [
        { kind: "section" as const, section: "define" },
        { kind: "section" as const },
      ],
      "missing_section",
    ],
    [
      [
        { kind: "section" as const, section: "define" },
        { kind: "lookup" as const, question: "  " },
      ],
      "missing_question",
    ],
  ])("rejects bad plans (%#)", (steps, reason) => {
    expect(validateMakePlan({ objective: "x", steps }, ctx)).toMatchObject({
      status: "rejected",
      reason,
    });
  });
});

describe("parseMakePlanInput", () => {
  it("parses tool input and drops unknown step kinds", () => {
    expect(
      parseMakePlanInput({
        objective: " Draft ",
        steps: [{ kind: "section", section: " define " }],
      })
    ).toEqual({ objective: "Draft", steps: [{ kind: "section", section: "define" }] });
    expect(
      parseMakePlanInput({ objective: "x", steps: [{ kind: "mark_done" }] })
    ).toBeNull();
  });
});

describe("looksMultiStepAsk", () => {
  it("fires on several named sections, a follow-up lookup, or several clauses", () => {
    const base = { documentType: "investigation_report" as const, alsoLookup: false };
    expect(looksMultiStepAsk({ ...base, userText: "draft define and measure" })).toBe(true);
    expect(looksMultiStepAsk({ ...base, userText: "draft it", alsoLookup: true })).toBe(true);
    expect(
      looksMultiStepAsk({
        ...base,
        userText:
          "summarise the deviation, then tighten the root cause, then list the CAPAs",
      })
    ).toBe(true);
  });

  it("stays off for a single short edit", () => {
    expect(
      looksMultiStepAsk({
        documentType: "investigation_report",
        alsoLookup: false,
        userText: "draft the define section",
      })
    ).toBe(false);
  });
});

describe("makePlanEligible", () => {
  const base = {
    mode: "agent" as const,
    intent: "write" as const,
    canEdit: true,
    planLive: false,
    userText: "draft define and measure",
    documentType: "investigation_report" as const,
    alsoLookup: false,
    autoContinue: false,
  };

  it("is Agent write only, with no live plan and not on auto-continue", () => {
    expect(makePlanEligible(base)).toBe(true);
    expect(makePlanEligible({ ...base, mode: "plan" })).toBe(false);
    expect(makePlanEligible({ ...base, intent: "read" })).toBe(false);
    expect(makePlanEligible({ ...base, intent: "social" })).toBe(false);
    expect(makePlanEligible({ ...base, canEdit: false })).toBe(false);
    expect(makePlanEligible({ ...base, planLive: true })).toBe(false);
    expect(makePlanEligible({ ...base, autoContinue: true })).toBe(false);
  });
});
