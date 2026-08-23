import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_TURN_STALE_MS,
  backgroundTurnFromSessionView,
  isAssistantTurnStale,
  isChatAssistantTurnActive,
} from "./background-turn-status";

describe("background-turn-status module", () => {
  it("does not import the database (safe for the chat-panel client bundle)", () => {
    const src = readFileSync(
      path.join(__dirname, "background-turn-status.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/from ["']@\/db/);
    expect(src).not.toMatch(/from ["']@\/db\//);
  });
});

describe("isChatAssistantTurnActive", () => {
  it("is true while the server is generating or a cancel is in flight", () => {
    expect(isChatAssistantTurnActive("idle")).toBe(false);
    expect(isChatAssistantTurnActive("running")).toBe(true);
    expect(isChatAssistantTurnActive("cancel_requested")).toBe(true);
  });
});

describe("backgroundTurnFromSessionView", () => {
  it("is idle when the server turn is finished", () => {
    expect(
      backgroundTurnFromSessionView({
        assistantTurnStatus: "idle",
        assistantTurnStartedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({ backgroundTurn: false, startedAt: null });
  });

  it("keeps the composer busy and the original start time while the server is generating", () => {
    expect(
      backgroundTurnFromSessionView({
        assistantTurnStatus: "running",
        assistantTurnStartedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({
      backgroundTurn: true,
      startedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(
      backgroundTurnFromSessionView({
        assistantTurnStatus: "cancel_requested",
        assistantTurnStartedAt: null,
      })
    ).toEqual({ backgroundTurn: true, startedAt: null });
  });
});

describe("isAssistantTurnStale", () => {
  it("treats a missing start as stale so a crashed isolate can be claimed", () => {
    expect(isAssistantTurnStale(null, 10_000)).toBe(true);
  });

  it("is stale only after the function budget plus buffer", () => {
    const started = new Date(1_000);
    expect(isAssistantTurnStale(started, 1_000 + CHAT_TURN_STALE_MS - 1)).toBe(
      false
    );
    expect(isAssistantTurnStale(started, 1_000 + CHAT_TURN_STALE_MS)).toBe(true);
  });
});
