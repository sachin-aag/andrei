/** Supported list marker styles for import, editor, and DOCX export. */
export type ListStyle = "decimal" | "disc" | "dash";

const ORDERED_LINE_RE = /^(\d+)[.)]\s+(.*)$/;
const DASH_LINE_RE = /^-\s+(.*)$/;
const DISC_LINE_RE = /^[•●◦]\s+(.*)$/;

export function parseListLine(
  line: string
):
  | { kind: "ordered"; text: string }
  | { kind: "bullet"; listStyle: "dash" | "disc"; text: string }
  | null {
  const trimmed = line.trim();
  const ordered = ORDERED_LINE_RE.exec(trimmed);
  if (ordered) return { kind: "ordered", text: ordered[2] ?? "" };

  const dash = DASH_LINE_RE.exec(trimmed);
  if (dash) return { kind: "bullet", listStyle: "dash", text: dash[1] ?? "" };

  const disc = DISC_LINE_RE.exec(trimmed);
  if (disc) return { kind: "bullet", listStyle: "disc", text: disc[1] ?? "" };

  return null;
}

export function listItemParagraph(text: string) {
  return {
    type: "listItem" as const,
    content: [
      {
        type: "paragraph" as const,
        content: text.length ? [{ type: "text" as const, text }] : [],
      },
    ],
  };
}
