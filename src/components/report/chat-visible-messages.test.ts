import { describe, expect, it } from "vitest";
import {
  CHAT_VISIBLE_PAGE,
  CHAT_VISIBLE_TAIL,
  nextVisibleCount,
  shouldLoadOlderMessages,
  visibleMessageStartIndex,
} from "@/components/report/chat-visible-messages";

describe("visibleMessageStartIndex", () => {
  it("returns 0 when the tail covers the whole thread", () => {
    expect(visibleMessageStartIndex(8, CHAT_VISIBLE_TAIL)).toBe(0);
  });

  it("hides older turns when the thread is longer than the tail", () => {
    expect(visibleMessageStartIndex(40, CHAT_VISIBLE_TAIL)).toBe(28);
  });

  it("clamps empty and negative counts", () => {
    expect(visibleMessageStartIndex(0, CHAT_VISIBLE_TAIL)).toBe(0);
    expect(visibleMessageStartIndex(10, -4)).toBe(10);
  });
});

describe("nextVisibleCount", () => {
  it("grows by a page and stops at the thread length", () => {
    expect(nextVisibleCount(CHAT_VISIBLE_TAIL, 40)).toBe(
      CHAT_VISIBLE_TAIL + CHAT_VISIBLE_PAGE
    );
    expect(nextVisibleCount(36, 40)).toBe(40);
  });

  it("stays at 0 for an empty thread", () => {
    expect(nextVisibleCount(CHAT_VISIBLE_TAIL, 0)).toBe(0);
  });
});

describe("shouldLoadOlderMessages", () => {
  it("loads only when the user is at the top and older turns exist", () => {
    expect(shouldLoadOlderMessages(0, CHAT_VISIBLE_TAIL, 40)).toBe(true);
    expect(shouldLoadOlderMessages(200, CHAT_VISIBLE_TAIL, 40)).toBe(false);
    expect(shouldLoadOlderMessages(0, 40, 40)).toBe(false);
  });
});
