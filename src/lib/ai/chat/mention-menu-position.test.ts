import { describe, expect, it, vi } from "vitest";
import { computeMentionMenuPosition } from "@/lib/ai/chat/mention-menu-position";

vi.mock("@/lib/plain-text/textarea-selection-rect", () => ({
  getTextareaCaretOffset: vi.fn(),
}));

import { getTextareaCaretOffset } from "@/lib/plain-text/textarea-selection-rect";

const mockedCaretOffset = vi.mocked(getTextareaCaretOffset);
const textarea = {} as HTMLTextAreaElement;

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

describe("computeMentionMenuPosition", () => {
  it("anchors above the @ token by default", () => {
    mockedCaretOffset.mockReturnValue({ top: 140, left: 24 });

    const position = computeMentionMenuPosition({
      textarea,
      atIndex: 0,
      menuWidth: 256,
      menuHeight: 120,
      anchorRect: rect(100, 200, 320, 96),
      boundaryRect: rect(80, 120, 360, 400),
    });

    expect(position).toEqual({ top: 140 - 120 - 4, left: 24 });
  });

  it("flips below the caret when there is no room above the anchor", () => {
    mockedCaretOffset.mockReturnValue({ top: 8, left: 10 });

    const position = computeMentionMenuPosition({
      textarea,
      atIndex: 0,
      menuWidth: 256,
      menuHeight: 120,
      anchorRect: rect(100, 200, 320, 96),
      boundaryRect: rect(80, 120, 360, 400),
    });

    expect(position.top).toBe(8 + 18 + 4);
    expect(position.left).toBe(10);
  });

  it("clamps horizontally inside the chat boundary", () => {
    mockedCaretOffset.mockReturnValue({ top: 140, left: 280 });

    const position = computeMentionMenuPosition({
      textarea,
      atIndex: 0,
      menuWidth: 256,
      menuHeight: 120,
      anchorRect: rect(100, 200, 320, 96),
      boundaryRect: rect(80, 120, 360, 400),
    });

    expect(position.left).toBeLessThan(280);
    expect(position.left + 256).toBeLessThanOrEqual(80 + 360 - 4);
  });
});
