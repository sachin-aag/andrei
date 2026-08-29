import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_TURN_STALE_MS,
  backgroundTurnFromSessionView,
  isAssistantTurnStale,
  isChatAssistantTurnActive,
  isChatAssistantTurnInFlight,
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

describe("isChatAssistantTurnInFlight", () => {
  it("is false for idle or a missing/expired start", () => {
    const started = new Date(1_000);
    expect(isChatAssistantTurnInFlight("idle", started, 2_000)).toBe(false);
    expect(isChatAssistantTurnInFlight("running", null, 2_000)).toBe(false);
    expect(
      isChatAssistantTurnInFlight(
        "cancel_requested",
        started,
        1_000 + CHAT_TURN_STALE_MS
      )
    ).toBe(false);
  });

  it("is true only while an active turn is still inside the stale window", () => {
    const started = new Date(1_000);
    expect(isChatAssistantTurnInFlight("running", started, 2_000)).toBe(true);
    expect(
      isChatAssistantTurnInFlight("cancel_requested", started, 2_000)
    ).toBe(true);
  });
});

describe("backgroundTurnFromSessionView", () => {
  const startedAt = "2026-01-01T00:00:00.000Z";
  const freshNow = Date.parse(startedAt) + 1_000;

  it("is idle when the server turn is finished", () => {
    expect(
      backgroundTurnFromSessionView(
        {
          assistantTurnStatus: "idle",
          assistantTurnStartedAt: startedAt,
        },
        freshNow
      )
    ).toEqual({ backgroundTurn: false, startedAt: null });
  });

  it("keeps the composer busy and the original start time while the server is generating", () => {
    expect(
      backgroundTurnFromSessionView(
        {
          assistantTurnStatus: "running",
          assistantTurnStartedAt: startedAt,
        },
        freshNow
      )
    ).toEqual({
      backgroundTurn: true,
      startedAt: Date.parse(startedAt),
    });
    expect(
      backgroundTurnFromSessionView(
        {
          assistantTurnStatus: "cancel_requested",
          assistantTurnStartedAt: startedAt,
        },
        freshNow
      )
    ).toEqual({
      backgroundTurn: true,
      startedAt: Date.parse(startedAt),
    });
  });

  it("does not keep the composer busy for an abandoned cancel or stale running row", () => {
    expect(
      backgroundTurnFromSessionView({
        assistantTurnStatus: "cancel_requested",
        assistantTurnStartedAt: null,
      })
    ).toEqual({ backgroundTurn: false, startedAt: null });
    expect(
      backgroundTurnFromSessionView(
        {
          assistantTurnStatus: "running",
          assistantTurnStartedAt: startedAt,
        },
        Date.parse(startedAt) + CHAT_TURN_STALE_MS
      )
    ).toEqual({ backgroundTurn: false, startedAt: null });
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
