import { describe, expect, it } from "vitest";
import {
  CHAT_NEAR_BOTTOM_PX,
  captureChatScrollPosition,
  isChatScrollerLaidOut,
  restoreChatScrollPosition,
  shouldStickChatToBottom,
} from "@/components/report/chat-scroll-position";

function scroller(metrics: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}) {
  return { ...metrics };
}

describe("isChatScrollerLaidOut", () => {
  it("is false while the sidebar is display-none (zero box)", () => {
    expect(isChatScrollerLaidOut({ clientHeight: 0 })).toBe(false);
  });

  it("is true once the panel has a height", () => {
    expect(isChatScrollerLaidOut({ clientHeight: 400 })).toBe(true);
  });
});

describe("captureChatScrollPosition", () => {
  it("returns null when hidden so a collapse cannot wipe the last position", () => {
    expect(
      captureChatScrollPosition(
        scroller({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
      )
    ).toBeNull();
  });

  it("treats the viewport as bottom when close enough to the end", () => {
    expect(
      captureChatScrollPosition(
        scroller({
          scrollTop: 552,
          scrollHeight: 1000,
          clientHeight: 400,
        })
      )
    ).toEqual({ kind: "bottom" });
    expect(
      captureChatScrollPosition(
        scroller({
          scrollTop: 1000 - 400 - CHAT_NEAR_BOTTOM_PX,
          scrollHeight: 1000,
          clientHeight: 400,
        })
      )
    ).toEqual({ kind: "bottom" });
  });

  it("stores distance from the bottom when the user scrolled up", () => {
    expect(
      captureChatScrollPosition(
        scroller({
          scrollTop: 200,
          scrollHeight: 1000,
          clientHeight: 400,
        })
      )
    ).toEqual({ kind: "offset", fromBottom: 400 });
  });
});

describe("shouldStickChatToBottom", () => {
  it("sticks when the last position is unknown or already at the bottom", () => {
    expect(shouldStickChatToBottom(null)).toBe(true);
    expect(shouldStickChatToBottom({ kind: "bottom" })).toBe(true);
    expect(shouldStickChatToBottom({ kind: "offset", fromBottom: 120 })).toBe(
      false
    );
  });
});

describe("restoreChatScrollPosition", () => {
  it("does nothing while the scroller has no layout box", () => {
    const el = scroller({ scrollTop: 12, scrollHeight: 0, clientHeight: 0 });
    restoreChatScrollPosition(el, { kind: "bottom" });
    expect(el.scrollTop).toBe(12);
  });

  it("opens at the bottom when the last position is unknown", () => {
    const el = scroller({
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    restoreChatScrollPosition(el, null);
    expect(el.scrollTop).toBe(1000);
  });

  it("pins to the (possibly grown) bottom when the user was following", () => {
    const el = scroller({
      scrollTop: 0,
      scrollHeight: 1600,
      clientHeight: 400,
    });
    restoreChatScrollPosition(el, { kind: "bottom" });
    expect(el.scrollTop).toBe(1600);
  });

  it("restores the same distance from the bottom after new turns append", () => {
    const el = scroller({
      scrollTop: 0,
      scrollHeight: 1400,
      clientHeight: 400,
    });
    restoreChatScrollPosition(el, { kind: "offset", fromBottom: 400 });
    expect(el.scrollTop).toBe(600);
  });

  it("clamps a huge offset to the top of the thread", () => {
    const el = scroller({
      scrollTop: 80,
      scrollHeight: 500,
      clientHeight: 400,
    });
    restoreChatScrollPosition(el, { kind: "offset", fromBottom: 9999 });
    expect(el.scrollTop).toBe(0);
  });
});
