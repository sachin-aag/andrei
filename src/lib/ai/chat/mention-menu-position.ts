import { getTextareaCaretOffset } from "@/lib/plain-text/textarea-selection-rect";

export type MentionMenuBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MentionMenuPositionInput = {
  textarea: HTMLTextAreaElement;
  atIndex: number;
  menuWidth: number;
  menuHeight: number;
  anchorRect: MentionMenuBounds;
  boundaryRect: MentionMenuBounds;
  gap?: number;
};

export type MentionMenuPosition = {
  top: number;
  left: number;
};

function lineHeightPx(textarea: HTMLTextAreaElement): number {
  if (typeof window === "undefined") return 18;
  const lineHeight = Number.parseFloat(
    window.getComputedStyle(textarea).lineHeight
  );
  return Number.isFinite(lineHeight) ? lineHeight : 18;
}

/**
 * Position the @ menu beside the token, preferring above the caret line and
 * clamping inside the chat boundary (relative to the anchor wrapper).
 */
export function computeMentionMenuPosition(
  input: MentionMenuPositionInput
): MentionMenuPosition {
  const gap = input.gap ?? 4;
  const caret = getTextareaCaretOffset(input.textarea, input.atIndex);
  const lineHeight = lineHeightPx(input.textarea);

  let top = caret.top - input.menuHeight - gap;
  if (top < 0) {
    top = caret.top + lineHeight + gap;
  }

  let left = caret.left;

  const menuLeftViewport = input.anchorRect.left + left;
  let menuRightViewport = menuLeftViewport + input.menuWidth;
  const boundaryLeft = input.boundaryRect.left + gap;
  const boundaryRight = input.boundaryRect.right - gap;

  if (menuRightViewport > boundaryRight) {
    left -= menuRightViewport - boundaryRight;
    menuRightViewport = boundaryRight;
  }
  if (menuLeftViewport < boundaryLeft) {
    left += boundaryLeft - menuLeftViewport;
  }

  let menuTopViewport = input.anchorRect.top + top;
  let menuBottomViewport = menuTopViewport + input.menuHeight;
  const boundaryTop = input.boundaryRect.top + gap;
  const boundaryBottom = input.boundaryRect.bottom - gap;

  if (menuBottomViewport > boundaryBottom) {
    top -= menuBottomViewport - boundaryBottom;
    menuTopViewport = input.anchorRect.top + top;
    menuBottomViewport = menuTopViewport + input.menuHeight;
  }
  if (menuTopViewport < boundaryTop) {
    top += boundaryTop - menuTopViewport;
  }

  return { top, left };
}
