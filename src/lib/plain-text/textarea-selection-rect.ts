const MIRROR_STYLE_PROPS = [
  "boxSizing",
  "width",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "textTransform",
  "wordSpacing",
  "textIndent",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
] as const;

function copyTextareaStyles(
  textarea: HTMLTextAreaElement,
  mirror: HTMLDivElement
) {
  const computed = window.getComputedStyle(textarea);
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  for (const prop of MIRROR_STYLE_PROPS) {
    mirror.style[prop] = computed[prop];
  }
}

/** Caret coordinates relative to the textarea's border box (scroll-adjusted). */
export function getTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const mirror = document.createElement("div");
  document.body.appendChild(mirror);
  copyTextareaStyles(textarea, mirror);

  const value = textarea.value;
  const before = value.slice(0, position);
  const after = value.slice(position) || "\u200b";

  mirror.textContent = before;
  const marker = document.createElement("span");
  marker.textContent = after;
  mirror.appendChild(marker);

  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;

  document.body.removeChild(mirror);
  return { top, left };
}

/** Viewport rect for the current textarea selection, or null when collapsed. */
export function getTextareaSelectionClientRect(
  textarea: HTMLTextAreaElement
): DOMRect | null {
  const { selectionStart, selectionEnd } = textarea;
  if (selectionStart === selectionEnd) return null;

  const textareaRect = textarea.getBoundingClientRect();
  const start = getTextareaCaretOffset(textarea, selectionStart);
  const end = getTextareaCaretOffset(textarea, selectionEnd);

  const left = textareaRect.left + Math.min(start.left, end.left);
  const top = textareaRect.top + Math.min(start.top, end.top);
  const right = textareaRect.left + Math.max(start.left, end.left);
  const bottom = textareaRect.top + Math.max(start.top, end.top) + 18;

  return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
}
