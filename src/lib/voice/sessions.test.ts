import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubSpeech: vi.fn(() => true),
}));

import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { STUB_VOICE_FINAL } from "./constants";
import type { VoiceSseEvent } from "./events";
import {
  createVoiceSession,
  subscribeVoiceSession,
  voiceSessions,
} from "./sessions";

describe("voice sessions", () => {
  afterEach(() => {
    voiceSessions.clear();
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
  });

  it("replays stub transcripts to a late SSE subscriber", async () => {
    const session = createVoiceSession("report-1", "engineer-1");
    await vi.waitFor(() => {
      expect(session.history.some((event) => event.type === "done")).toBe(true);
    });
    const replayed: VoiceSseEvent[] = [];
    subscribeVoiceSession(session, (event) => replayed.push(event));
    expect(
      replayed.some(
        (event) => event.type === "transcript" && event.text === STUB_VOICE_FINAL
      )
    ).toBe(true);
    expect(replayed.at(-1)).toEqual({ type: "done" });
    expect(voiceSessions.get(session.id)).toBeDefined();
  });
});
