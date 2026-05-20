/** Supported list marker styles for import, editor, and DOCX export. */
export type ListStyle = "decimal" | "disc" | "dash";

/** Word `w:numId` values defined in `templates/investigation-report-template.docx`. */
export const WORD_LIST_NUM_IDS = {
  decimal: 35,
  disc: 36,
  dash: 37,
} as const satisfies Record<ListStyle, number>;

export function wordNumIdForList(
  listType: "bulletList" | "orderedList",
  listStyle?: string | null
): number {
  if (listType === "orderedList") return WORD_LIST_NUM_IDS.decimal;
  return listStyle === "dash"
    ? WORD_LIST_NUM_IDS.dash
    : WORD_LIST_NUM_IDS.disc;
}

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
