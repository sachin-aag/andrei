import { describe, expect, it, vi } from "vitest";
import {
  CHAT_TURN_STALE_MS,
  drainSseStream,
  isAssistantTurnStale,
  isChatAssistantTurnActive,
} from "./background-turn";

vi.mock("@/db", () => ({
  db: {},
}));

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

describe("drainSseStream", () => {
  it("reads the stream to completion", async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("data: one\n\n");
        controller.enqueue("data: [DONE]\n\n");
        controller.close();
      },
    });
    await expect(drainSseStream(stream)).resolves.toBeUndefined();
  });

  it("swallows a mid-stream cancel from the other tee branch", async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("data: one\n\n");
        controller.error(new Error("client disconnected"));
      },
    });
    await expect(drainSseStream(stream)).resolves.toBeUndefined();
  });
});
