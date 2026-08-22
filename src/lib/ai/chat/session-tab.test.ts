import { describe, expect, it } from "vitest";
import { UNTITLED_SESSION } from "./session-title";
import {
  buildChatSessionTabItems,
  chatHasOpenQuestions,
  chatSessionTabSnapshot,
  chatSessionTabStatus,
  chatSessionTabStatusLabel,
  firstUserMessageTitle,
  sessionTabSnapshotsEqual,
} from "./session-tab";

const askUserPart = {
  type: "tool-ask_user",
  state: "output-available",
  input: { questions: [{ question: "What is the batch number?" }] },
};

describe("chatSessionTabStatus", () => {
  it("prefers a running turn over open questions", () => {
    expect(
      chatSessionTabStatus("streaming", [
        { role: "assistant", parts: [askUserPart] },
      ])
    ).toBe("running");
    expect(chatSessionTabStatus("submitted", [])).toBe("running");
  });

  it("marks a settled ask_user turn as questions", () => {
    expect(
      chatSessionTabStatus("ready", [
        { role: "assistant", parts: [askUserPart] },
      ])
    ).toBe("questions");
  });

  it("marks a finished thread without questions as done", () => {
    expect(
      chatSessionTabStatus("ready", [
        { role: "user", parts: [{ type: "text", text: "Draft Define" }] },
        { role: "assistant", parts: [{ type: "text", text: "Done." }] },
      ])
    ).toBe("done");
  });
});

describe("chatHasOpenQuestions", () => {
  it("requires ask_user on the latest assistant turn", () => {
    expect(chatHasOpenQuestions([])).toBe(false);
    expect(
      chatHasOpenQuestions([
        { role: "assistant", parts: [askUserPart] },
        { role: "user", parts: [{ type: "text", text: "Lot 12" }] },
      ])
    ).toBe(false);
    expect(
      chatHasOpenQuestions([{ role: "assistant", parts: [askUserPart] }])
    ).toBe(true);
  });

  it("ignores an ask_user tool that errored or has no questions", () => {
    expect(
      chatHasOpenQuestions([
        {
          role: "assistant",
          parts: [{ ...askUserPart, state: "output-error" }],
        },
      ])
    ).toBe(false);
    expect(
      chatHasOpenQuestions([
        {
          role: "assistant",
          parts: [
            {
              type: "tool-ask_user",
              input: { questions: [] },
            },
          ],
        },
      ])
    ).toBe(false);
  });
});

describe("firstUserMessageTitle", () => {
  it("uses the first user text part", () => {
    expect(
      firstUserMessageTitle([
        { role: "assistant", parts: [{ type: "text", text: "Hello" }] },
        { role: "user", parts: [{ type: "text", text: "  Draft Improve  " }] },
      ])
    ).toBe("Draft Improve");
  });

  it("falls back to the untitled label", () => {
    expect(firstUserMessageTitle([])).toBe(UNTITLED_SESSION);
    expect(
      firstUserMessageTitle([
        { role: "user", parts: [{ type: "file", text: "" }] },
      ])
    ).toBe(UNTITLED_SESSION);
  });
});

describe("buildChatSessionTabItems", () => {
  it("prefers a persisted title, then the live snapshot, then New chat", () => {
    expect(
      buildChatSessionTabItems({
        mountedIds: ["a", "b", "c"],
        sessions: [{ id: "a", title: "Persisted Define draft" }],
        snapshots: {
          a: { status: "done", title: "Ignored live title" },
          b: { status: "running", title: "Live Improve ping" },
        },
        runningIds: new Set(["c"]),
      })
    ).toEqual([
      { id: "a", title: "Persisted Define draft", status: "done" },
      { id: "b", title: "Live Improve ping", status: "running" },
      { id: "c", title: UNTITLED_SESSION, status: "running" },
    ]);
  });

  it("treats the untitled persisted label as unset so the live title wins", () => {
    expect(
      buildChatSessionTabItems({
        mountedIds: ["a"],
        sessions: [{ id: "a", title: UNTITLED_SESSION }],
        snapshots: { a: { status: "done", title: "Draft Control" } },
        runningIds: new Set(),
      })
    ).toEqual([{ id: "a", title: "Draft Control", status: "done" }]);
  });
});

describe("sessionTabSnapshotsEqual", () => {
  it("compares status and title", () => {
    const snap = chatSessionTabSnapshot("ready", [
      { role: "user", parts: [{ type: "text", text: "Hello" }] },
    ]);
    expect(sessionTabSnapshotsEqual(undefined, snap)).toBe(false);
    expect(sessionTabSnapshotsEqual(snap, snap)).toBe(true);
    expect(
      sessionTabSnapshotsEqual(snap, { ...snap, status: "running" })
    ).toBe(false);
  });
});

describe("chatSessionTabStatusLabel", () => {
  it("labels each status for the tab name", () => {
    expect(chatSessionTabStatusLabel("running")).toBe("Still working");
    expect(chatSessionTabStatusLabel("questions")).toBe("Needs answers");
    expect(chatSessionTabStatusLabel("done")).toBe("Ready");
  });
});
