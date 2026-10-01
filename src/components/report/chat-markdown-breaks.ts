/**
 * GFM table cells cannot contain real newlines, so DOCX import, TipTap
 * markdown, and the assistant reuse HTML `<br>` for a hard line break.
 * react-markdown does not parse that as a break (no rehype-raw), so the
 * tag would otherwise show as literal text in chat.
 */

const HTML_BR_SPLIT_RE = /<br\s*\/?>/gi;
const HAS_HTML_BR_RE = /<br\s*\/?>/i;
const HTML_BR_ONLY_RE = /^<br\s*\/?>$/i;
const SKIP_NODE_TYPES = new Set(["code", "inlineCode", "inlineMath", "math"]);

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

function splitTextOnHtmlBr(value: string): MdastNode[] {
  const parts = value.split(HTML_BR_SPLIT_RE);
  if (parts.length === 1) return [{ type: "text", value }];
  const nodes: MdastNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) nodes.push({ type: "break" });
    const part = parts[i];
    if (part) nodes.push({ type: "text", value: part });
  }
  return nodes;
}

function rewriteHtmlBreaks(node: MdastNode): void {
  if (SKIP_NODE_TYPES.has(node.type) || !node.children?.length) return;
  const next: MdastNode[] = [];
  for (const child of node.children) {
    rewriteHtmlBreaks(child);
    if (child.type === "html" && child.value && HTML_BR_ONLY_RE.test(child.value.trim())) {
      next.push({ type: "break" });
      continue;
    }
    if (child.type === "text" && child.value && HAS_HTML_BR_RE.test(child.value)) {
      next.push(...splitTextOnHtmlBr(child.value));
      continue;
    }
    next.push(child);
  }
  node.children = next;
}

/** remark plugin: `<br>` / `<br/>` / `<br />` → mdast `break` (rendered as `<br>`). */
export function remarkHtmlBreaks() {
  return (tree: MdastNode) => {
    rewriteHtmlBreaks(tree);
  };
}
