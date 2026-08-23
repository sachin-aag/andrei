import { describe, expect, it } from "vitest";
import {
  canReplaceChatMessages,
  dropBackgroundSession,
  forgetMountedSession,
  isChatSessionBusy,
  isChatTurnBusy,
  nextMountedSessionId,
  rememberBackgroundSession,
  rememberMountedSession,
  reportChatInstanceId,
  runningChatSessionIds,
  waitForValue,
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
    expect(isChatSessionBusy({ status: "ready" })).toBe(false);
    expect(isChatSessionBusy({ status: "ready", backgroundTurn: true })).toBe(
      true
    );
    expect(isChatSessionBusy({ status: "streaming", backgroundTurn: false })).toBe(
      true
    );
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

  it("forgets a mounted session without touching the others", () => {
    const mounted = rememberMountedSession(
      rememberMountedSession([], "ses-1", true),
      "ses-2",
      false
    );
    expect(forgetMountedSession(mounted, "ses-1")).toEqual([
      { id: "ses-2", hydrateOnMount: false },
    ]);
    expect(forgetMountedSession(mounted, "missing")).toEqual(mounted);
  });

  it("picks the next open tab after a close", () => {
    expect(nextMountedSessionId(["a", "b", "c"], "b")).toBe("c");
    expect(nextMountedSessionId(["a", "b", "c"], "c")).toBe("b");
    expect(nextMountedSessionId(["a", "b", "c"], "a")).toBe("b");
    expect(nextMountedSessionId(["a"], "a")).toBeNull();
    expect(nextMountedSessionId([], "a")).toBeNull();
  });

  it("includes the current session in running ids only while it is busy", () => {
    expect([...runningChatSessionIds(["bg"], "cur", false)]).toEqual(["bg"]);
    expect(runningChatSessionIds(["bg"], "cur", true).has("cur")).toBe(true);
    expect(runningChatSessionIds(["bg"], "cur", true).has("bg")).toBe(true);
    expect(runningChatSessionIds([], null, true).size).toBe(0);
  });

  it("resolves as soon as the reader returns a value", async () => {
    let n = 0;
    const value = await waitForValue(
      () => {
        n += 1;
        return n >= 3 ? "ready" : null;
      },
      { attempts: 5, delayMs: 1 }
    );
    expect(value).toBe("ready");
    expect(n).toBe(3);
  });

  it("returns null after the last attempt", async () => {
    const value = await waitForValue(() => null, { attempts: 2, delayMs: 1 });
    expect(value).toBeNull();
  });
});
