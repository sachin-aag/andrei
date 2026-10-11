import { describe, expect, it } from "vitest";
import {
  rectIntersectsBounds,
  shouldShowSelectionCommentBubble,
  type ClientBox,
} from "@/lib/tiptap/selection-comment-anchor";

const pane: ClientBox = {
  top: 120,
  right: 800,
  bottom: 900,
  left: 40,
  width: 760,
  height: 780,
};

function show(
  overrides: Partial<Parameters<typeof shouldShowSelectionCommentBubble>[0]>
) {
  return shouldShowSelectionCommentBubble({
    canInlineComment: true,
    editable: true,
    composing: false,
    editorFocused: true,
    selectionEmpty: false,
    overPlaceholder: false,
    paneActive: true,
    anchorIntersectsPane: true,
    ...overrides,
  });
}

describe("selection comment anchor", () => {
  it("treats a selection scrolled above the canvas as off-screen", () => {
    const scrolledAway: ClientBox = {
      top: -40,
      right: 400,
      bottom: 10,
      left: 80,
      width: 320,
      height: 50,
    };
    expect(rectIntersectsBounds(scrolledAway, pane)).toBe(false);
  });

  it("keeps a selection that still overlaps the canvas", () => {
    const visible: ClientBox = {
      top: 100,
      right: 400,
      bottom: 160,
      left: 80,
      width: 320,
      height: 60,
    };
    expect(rectIntersectsBounds(visible, pane)).toBe(true);
  });

  it("ignores an empty measurement", () => {
    const empty: ClientBox = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
    };
    expect(rectIntersectsBounds(empty, pane)).toBe(false);
  });

  it("hides the chip when the editor is not focused", () => {
    expect(show({ editorFocused: false })).toBe(false);
  });

  it("hides the chip when the selection has left the canvas", () => {
    expect(show({ anchorIntersectsPane: false })).toBe(false);
  });

  it("keeps an in-progress comment even if the selection measurement drops", () => {
    expect(
      show({ composing: true, editorFocused: false, anchorIntersectsPane: false })
    ).toBe(true);
  });

  it("does not offer a comment on a parked canvas", () => {
    expect(show({ paneActive: false, composing: true })).toBe(false);
  });
});
