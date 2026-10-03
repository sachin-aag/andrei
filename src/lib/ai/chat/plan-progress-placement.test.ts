import { describe, expect, it } from "vitest";
import type { ChatPendingPlan } from "@/lib/ai/chat/pending-plan";
import { remainingSectionPlanInsertIndex } from "./plan-progress-placement";

function plan(paused: boolean): ChatPendingPlan {
  return {
    kind: "section_queue",
    objective: "Draft the remaining sections",
    items: [
      { sectionKey: "qsr_objective", label: "1.1 Objective", state: "done" },
      {
        sectionKey: "qsr_acronyms",
        label: "1.4 Acronyms and Abbreviations",
        state: paused ? "queued" : "in_progress",
      },
    ],
    createdAt: "2026-10-02T00:00:00.000Z",
    promptVersion: "chat-v94-section-plan",
    ...(paused ? { paused: true, pauseReason: "cancelled" } : {}),
  };
}

const continuation = {
  remaining: 2,
  nextLabel: "1.4 Acronyms and Abbreviations",
  itemIndex: 2,
  total: 5,
};

describe("remainingSectionPlanInsertIndex", () => {
  it("pins a live queue under the transcript", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
        ],
        plan(false)
      )
    ).toBe(2);
  });

  it("stays under the transcript when a paused queue has no later prompt", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
        ],
        plan(true)
      )
    ).toBe(2);
  });

  it("sits above a typed prompt that follows a paused remaining-section turn", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
          { role: "user", metadata: { chatTarget: "report" } },
        ],
        plan(true)
      )
    ).toBe(2);
  });

  it("stays above that interrupting prompt after the assistant replies", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
          { role: "user", metadata: { chatTarget: "report" } },
          { role: "assistant" },
        ],
        plan(true)
      )
    ).toBe(2);
  });

  it("skips hidden auto-continue user rows before the interrupting prompt", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
          { role: "user", metadata: { autoContinue: true } },
          { role: "user", metadata: { chatTarget: "report" } },
        ],
        plan(true)
      )
    ).toBe(3);
  });

  it("skips a leftover remaining-section assistant that has no continuation stamp", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant", metadata: { continuation } },
          { role: "user", metadata: { autoContinue: true } },
          { role: "assistant" },
          { role: "user", metadata: { chatTarget: "report" } },
        ],
        plan(true)
      )
    ).toBe(4);
  });

  it("uses the last assistant when Cancel happened before continuation metadata", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [
          { role: "user" },
          { role: "assistant" },
          { role: "user", metadata: { chatTarget: "report" } },
        ],
        plan(true)
      )
    ).toBe(2);
  });

  it("stays at the end when the only user row started the remaining-section draft", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [{ role: "user" }, { role: "assistant" }],
        plan(true)
      )
    ).toBe(2);
  });

  it("returns the end when there is no remaining-section queue", () => {
    expect(
      remainingSectionPlanInsertIndex(
        [{ role: "user" }, { role: "assistant" }],
        null
      )
    ).toBe(2);
  });
});
