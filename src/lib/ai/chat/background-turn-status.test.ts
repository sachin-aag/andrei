import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_TURN_STALE_MS,
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
