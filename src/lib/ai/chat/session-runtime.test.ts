import { describe, expect, it } from "vitest";
import {
  canReplaceChatMessages,
  dropBackgroundSession,
  isChatTurnBusy,
  rememberBackgroundSession,
  rememberMountedSession,
  reportChatInstanceId,
  runningChatSessionIds,
} from "./session-runtime";

describe("session-runtime", () => {
  it("keys Chat instances per report and session", () => {
    expect(reportChatInstanceId("rep-1", "ses-2")).toBe(
      "report-chat-rep-1-ses-2"
    );
  });

  it("treats submitted and streaming as a busy turn", () => {
    expect(isChatTurnBusy("submitted")).toBe(true);
    expect(isChatTurnBusy("streaming")).toBe(true);
    expect(isChatTurnBusy("ready")).toBe(false);
    expect(isChatTurnBusy("error")).toBe(false);
  });

  it("refuses to replace messages while a turn is in flight", () => {
    expect(canReplaceChatMessages("streaming")).toBe(false);
    expect(canReplaceChatMessages("submitted")).toBe(false);
    expect(canReplaceChatMessages("ready")).toBe(true);
    expect(canReplaceChatMessages("error")).toBe(true);
  });

  it("tracks background sessions without duplicates", () => {
    expect(rememberBackgroundSession([], "a")).toEqual(["a"]);
    expect(rememberBackgroundSession(["a"], "a")).toEqual(["a"]);
    expect(rememberBackgroundSession(["a"], "b")).toEqual(["a", "b"]);
    expect(rememberBackgroundSession(["a"], null)).toEqual(["a"]);
    expect(dropBackgroundSession(["a", "b"], "a")).toEqual(["b"]);
  });

  it("keeps the first mount record for a session", () => {
    const first = rememberMountedSession([], "ses-1", true);
    expect(first).toEqual([{ id: "ses-1", hydrateOnMount: true }]);
    expect(rememberMountedSession(first, "ses-1", false)).toEqual(first);
    expect(rememberMountedSession(first, "ses-2", false)).toEqual([
      { id: "ses-1", hydrateOnMount: true },
      { id: "ses-2", hydrateOnMount: false },
    ]);
  });

  it("includes the current session in running ids only while it is busy", () => {
    expect([...runningChatSessionIds(["bg"], "cur", false)]).toEqual(["bg"]);
    expect(runningChatSessionIds(["bg"], "cur", true).has("cur")).toBe(true);
    expect(runningChatSessionIds(["bg"], "cur", true).has("bg")).toBe(true);
    expect(runningChatSessionIds([], null, true).size).toBe(0);
  });
});
