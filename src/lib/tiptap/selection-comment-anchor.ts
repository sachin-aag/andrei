export type ClientBox = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

/** True when a selection rect overlaps the visible canvas, not merely the viewport. */
export function rectIntersectsBounds(rect: ClientBox, bounds: ClientBox): boolean {
  if (rect.width <= 0 && rect.height <= 0) return false;
  return (
    rect.bottom > bounds.top &&
    rect.top < bounds.bottom &&
    rect.right > bounds.left &&
    rect.left < bounds.right
  );
}

/**
 * The comment chip follows the live selection. A later document update must
 * not bring it back once focus has left, and a selection that has scrolled
 * out of the canvas must not pin the chip to the window edge.
 */
export function shouldShowSelectionCommentBubble(input: {
  canInlineComment: boolean;
  editable: boolean;
  composing: boolean;
  editorFocused: boolean;
  selectionEmpty: boolean;
  overPlaceholder: boolean;
  paneActive: boolean;
  anchorIntersectsPane: boolean;
}): boolean {
  if (!input.canInlineComment || !input.editable) return false;
  if (!input.paneActive) return false;
  if (input.composing) return true;
  if (!input.editorFocused) return false;
  if (input.selectionEmpty || input.overPlaceholder) return false;
  return input.anchorIntersectsPane;
}
