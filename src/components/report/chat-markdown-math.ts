export const CHAT_MATH_CLASS = "chat-math";
export const CHAT_MATH_INLINE_CLASS = "chat-math-inline";
export const CHAT_MATH_BLOCK_CLASS = "chat-math-block";

type MathMdastNode = { value?: string };

type HastText = { type: "text"; value: string };

type HastElement = {
  type: "element";
  tagName: "span" | "div";
  properties: { className: string[] };
  children: HastText[];
};

/**
 * Normalize LaTeX in assistant markdown so remark-math can parse it:
 * - `$<60$` is tokenized as HTML (`<60$`); `\lt` / `\gt` keep the dollars.
 * - One-line `$$...$$` is treated as display math (LLM output often omits newlines).
 */
export function rewriteChatMathHtmlConflicts(markdown: string): string {
  return markdown
    .replace(/\$\$([^$\n]+?)\$\$/g, (_match, inner: string) => `\n$$\n${inner}\n$$\n`)
    .replace(/\$</g, "$\\lt ")
    .replace(/\$>/g, "$\\gt ");
}

function mathHastHandler(
  tagName: "span" | "div",
  extraClass: string
): (_state: unknown, node: MathMdastNode) => HastElement {
  return (_state, node) => ({
    type: "element",
    tagName,
    properties: {
      className: [CHAT_MATH_CLASS, extraClass],
    },
    children: [{ type: "text", value: node.value ?? "" }],
  });
}

/** remark-rehype handlers so `$...$` / `$$...$$` become styled HTML nodes. */
export const CHAT_MATH_HAST_HANDLERS = {
  inlineMath: mathHastHandler("span", CHAT_MATH_INLINE_CLASS),
  math: mathHastHandler("div", CHAT_MATH_BLOCK_CLASS),
};

export function isChatMathClassName(className: unknown): boolean {
  if (typeof className === "string") {
    return className.split(/\s+/).includes(CHAT_MATH_CLASS);
  }
  if (Array.isArray(className)) {
    return className.includes(CHAT_MATH_CLASS);
  }
  return false;
}

export function chatMathDisplayFromClassName(className: unknown): "inline" | "block" {
  const classes = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  return classes.includes(CHAT_MATH_BLOCK_CLASS) ? "block" : "inline";
}

export function reactNodeToPlainText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(reactNodeToPlainText).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return reactNodeToPlainText(props?.children);
  }
  return "";
}
