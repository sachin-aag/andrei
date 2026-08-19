import type { JSONContent } from "@tiptap/core";
import { parseListLine } from "@/lib/tiptap/list-style";

const ATX_HEADING_RE = /^(#{1,3})\s+(.*)$/;

/** ATX `#`–`###` line → bold paragraph (section editor has no heading node). */
export function atxHeadingParagraph(text: string): JSONContent | null {
  const heading = ATX_HEADING_RE.exec(text.trim());
  if (!heading) return null;
  const headingText = heading[2]!.replace(/\*\*([^*]+)\*\*/g, "$1");
  if (!headingText) return null;
  return {
    type: "paragraph",
    content: [{ type: "text", text: headingText, marks: [{ type: "bold" }] }],
  };
}

function paragraphPlainText(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "text") return child.text ?? "";
      if (child.type === "hardBreak") return "\n";
      return "";
    })
    .join("");
}

function paragraphIsPlainInline(node: JSONContent): boolean {
  return (node.content ?? []).every(
    (child) => child.type === "text" || child.type === "hardBreak"
  );
}

/**
 * Turn persisted paragraphs that still start with `#` / `##` / `###` into the
 * same bold paragraphs `markdownToDoc` emits, so Improve/Control don't show
 * literal hashes.
 */
export function promoteAtxHeadingsInDoc(doc: JSONContent): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "paragraph" && paragraphIsPlainInline(node)) {
      const promoted = atxHeadingParagraph(paragraphPlainText(node));
      if (promoted) return promoted;
    }
    if (node.content?.length) {
      return { ...node, content: node.content.map(visit) };
    }
    return node;
  }
  return visit(doc);
}

/**
 * Deterministic GFM-subset markdown → TipTap doc converter for AI redrafts.
 *
 * Supported (matches what the drafting prompt allows the model to emit):
 * - paragraphs (one line = one paragraph)
 * - headings `#` … `###` → rendered as a bold paragraph (the section editor
 *   schema has no heading node; emitting one makes ProseMirror drop the doc)
 * - bullet (`- `, `* `) and ordered (`1. `) lists
 * - GFM tables (first row = header)
 * - `**bold**` inline emphasis
 *
 * Anything else is kept as literal text. No HTML, no fuzziness.
 */
export function markdownToDoc(markdown: string): JSONContent {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (isTableRow(trimmed) && isTableSeparator(lines[i + 1]?.trim() ?? "")) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i]!.trim())) {
        tableLines.push(lines[i]!.trim());
        i++;
      }
      const table = parseTable(tableLines);
      if (table) content.push(table);
      continue;
    }

    const heading = atxHeadingParagraph(trimmed);
    if (heading) {
      content.push(heading);
      i++;
      continue;
    }

    const listStart = parseListItemLine(trimmed);
    if (listStart) {
      const items: JSONContent[] = [];
      const kind = listStart.kind;
      while (i < lines.length) {
        const next = parseListItemLine(lines[i]!.trim());
        if (!next || next.kind !== kind) break;
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(next.text) }],
        });
        i++;
      }
      content.push(
        kind === "ordered"
          ? { type: "orderedList", content: items }
          : { type: "bulletList", attrs: { listStyle: "dash" }, content: items }
      );
      continue;
    }

    content.push({ type: "paragraph", content: parseInline(trimmed) });
    i++;
  }

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return { type: "doc", content };
}

/** Markdown containing a GFM table (used to route tables away from plain fields). */
export function markdownHasTable(markdown: string): boolean {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableRow(lines[i]!.trim()) && isTableSeparator(lines[i + 1]!.trim())) {
      return true;
    }
  }
  return false;
}

/** Plain-text rendering of the same markdown subset (for plain string fields). */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^#{1,3}\s+/, ""))
    .join("\n")
    .trim();
}

function parseListItemLine(
  trimmed: string
): { kind: "ordered" | "bullet"; text: string } | null {
  // markdown `* item` bullets (parseListLine covers `- ` and ordered).
  const star = /^\*\s+(.*)$/.exec(trimmed);
  if (star) return { kind: "bullet", text: star[1] ?? "" };
  const parsed = parseListLine(trimmed);
  if (!parsed) return null;
  return { kind: parsed.kind === "ordered" ? "ordered" : "bullet", text: parsed.text };
}

/** `**bold**` spans → bold-marked text nodes; everything else literal. */
function parseInline(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      nodes.push({ type: "text", text: bold[1]!, marks: [{ type: "bold" }] });
    } else {
      nodes.push({ type: "text", text: part });
    }
  }
  return nodes;
}

function isTableRow(trimmed: string): boolean {
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function isTableSeparator(trimmed: string): boolean {
  if (!isTableRow(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function splitTableRow(trimmed: string): string[] {
  let row = trimmed;
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  // Split on unescaped pipes, then unescape.
  return row
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function tableCellNode(type: "tableHeader" | "tableCell", text: string): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1 },
    content: [{ type: "paragraph", content: parseInline(text) }],
  };
}

function parseTable(tableLines: string[]): JSONContent | null {
  // tableLines[1] is the header separator; drop it.
  const dataLines = tableLines.filter((_, idx) => idx !== 1);
  if (dataLines.length === 0) return null;

  const rowsCells = dataLines.map(splitTableRow);
  const colCount = Math.max(...rowsCells.map((cells) => cells.length));
  if (colCount === 0) return null;

  const rows: JSONContent[] = rowsCells.map((cells, rowIdx) => {
    const type = rowIdx === 0 ? "tableHeader" : "tableCell";
    const padded = [...cells];
    while (padded.length < colCount) padded.push("");
    return {
      type: "tableRow",
      content: padded.map((cell) => tableCellNode(type, cell)),
    };
  });

  return { type: "table", content: rows };
}
