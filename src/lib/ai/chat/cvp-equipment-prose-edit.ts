import type { JSONContent } from "@tiptap/core";
import {
  checkProposedEdit,
  type ProposedEditInput,
} from "@/lib/ai/chat/propose-edit";
import { cvpEquipmentItemIndexFromTarget } from "@/lib/document-types/cvp/equipment-item-path";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { markdownHasTable } from "@/lib/tiptap/markdown-to-doc";

const SUBSECTION_RE = /\b(15\.\d+\.\d+)\b/;
const TABLE_CAPTION_RE = /^Table\s+\d+\.\s+\S/i;
const ATX_HEADING_RE = /^(#{1,6})\s+/;

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function headingPlain(node: JSONContent): string {
  return nodePlain(node).replace(/\s+/g, " ").trim();
}

function isGfmTableRow(trimmed: string): boolean {
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function isGfmTableSeparator(trimmed: string): boolean {
  if (!isGfmTableRow(trimmed)) return false;
  return trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .every((cell) => /^:?-{3,}:?$/.test(cell));
}

/** Drop GFM grids and `Table N. Title` captions from a leftover 15.N.M dump. */
export function stripCvpEquipmentProseTables(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const next = lines[i + 1]?.trim();
    if (
      next !== undefined &&
      isGfmTableRow(trimmed) &&
      isGfmTableSeparator(next)
    ) {
      i += 1;
      while (i + 1 < lines.length && isGfmTableRow(lines[i + 1]!.trim())) {
        i += 1;
      }
      continue;
    }
    if (TABLE_CAPTION_RE.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function cvpEquipmentSubsectionOrdinal(
  ...texts: readonly string[]
): string | null {
  for (const text of texts) {
    const match = SUBSECTION_RE.exec(text);
    if (match) return match[1]!;
  }
  return null;
}

function stripLeadingSubsectionHeading(text: string, ordinal: string): string {
  const escaped = ordinal.replace(/\./g, "\\.");
  return text
    .replace(
      new RegExp(`^(?:#{1,6}\\s*)?${escaped}\\b[^\\n]*\\n+`, "i"),
      ""
    )
    .trim();
}

function cutAtNextSubsection(text: string, ordinal: string): string {
  const nextHeading = /(?:^|\n)(?:#{1,6}\s*)?15\.\d+\.\d+\b/i;
  const stripped = stripLeadingSubsectionHeading(text, ordinal);
  const match = nextHeading.exec(stripped);
  if (!match || match[0].includes(ordinal)) return stripped.trim();
  const idx = match.index ?? 0;
  if (idx <= 0) return stripped.trim();
  return stripped.slice(0, idx).trim();
}

function equipmentIndexesInField(doc: JSONContent): Set<number> {
  const indexes = new Set<number>();
  for (const node of doc.content ?? []) {
    if (node.type !== "heading") continue;
    const ordinal = cvpEquipmentSubsectionOrdinal(headingPlain(node));
    if (!ordinal) continue;
    const index = cvpEquipmentItemIndexFromTarget(ordinal);
    if (index != null) indexes.add(index);
  }
  return indexes;
}

function headingTitleFromInsert(insert: string, ordinal: string): string {
  const escaped = ordinal.replace(/\./g, "\\.");
  const match = new RegExp(
    `(?:^|\\n)(?:#{1,6}\\s*)?(${escaped}\\b[^\\n]*)`,
    "i"
  ).exec(insert);
  const line = (match?.[1] ?? `${ordinal}`).replace(ATX_HEADING_RE, "").trim();
  return line.length > 0 ? line : ordinal;
}

function subsectionOrdinalOfHeading(node: JSONContent): string | null {
  if (node.type !== "heading") return null;
  return cvpEquipmentSubsectionOrdinal(headingPlain(node));
}

function compareSubsection(a: string, b: string): number {
  const parts = (value: string) =>
    value.split(".").map((part) => Number(part) || 0);
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function followingUntilBoundary(
  nodes: readonly JSONContent[],
  headingIndex: number
): JSONContent[] {
  const following: JSONContent[] = [];
  for (let i = headingIndex + 1; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type === "heading" || node.type === "table") break;
    following.push(node);
  }
  return following;
}

function flatOf(nodes: readonly JSONContent[]): string {
  if (nodes.length === 0) return "";
  return flattenForAnchor({ type: "doc", content: [...nodes] }).text.trim();
}

function replacementForExistingHeading(input: {
  heading: JSONContent;
  following: readonly JSONContent[];
  prose: string;
}): ProposedEditInput | null {
  const headingText = headingPlain(input.heading);
  if (!headingText) return null;
  const followingText = flatOf(input.following);
  if (followingText && collapse(followingText) === collapse(input.prose)) {
    return null;
  }
  if (followingText) {
    return {
      anchorText: `${headingText}\n${followingText}`,
      deleteText: followingText,
      insertText: input.prose,
    };
  }
  return {
    anchorText: headingText,
    deleteText: headingText,
    insertText: `### ${headingText}\n\n${input.prose}`,
  };
}

function replacementBeforeNextHeading(input: {
  nextHeading: JSONContent;
  title: string;
  prose: string;
}): ProposedEditInput | null {
  const nextText = headingPlain(input.nextHeading);
  if (!nextText) return null;
  return {
    anchorText: nextText,
    deleteText: nextText,
    insertText: `### ${input.title}\n\n${input.prose}\n\n### ${nextText}`,
  };
}

/**
 * When leftover 15.N.M prose is pasted with Table N / GFM (or the quoted
 * span misses), retarget the heading's following paragraph so propose_edit
 * can still open a card.
 */
export function repairCvpEquipmentProseEdit(input: {
  fieldDoc: JSONContent;
  fieldText: string;
  edit: ProposedEditInput;
}): ProposedEditInput | null {
  const hasTable =
    markdownHasTable(input.edit.insertText) ||
    markdownHasTable(input.edit.anchorText) ||
    markdownHasTable(input.edit.deleteText);
  const subsection = cvpEquipmentSubsectionOrdinal(
    input.edit.insertText,
    input.edit.deleteText,
    input.edit.anchorText
  );
  if (!hasTable && !subsection) return null;
  const emptyAnchorSubsectionDump =
    Boolean(subsection) && !(input.edit.anchorText ?? "").trim();
  if (!hasTable && !emptyAnchorSubsectionDump) {
    const current = checkProposedEdit(
      input.fieldText,
      input.edit,
      input.fieldDoc
    );
    if (current.status === "ok") return null;
  }

  const cleaned = stripCvpEquipmentProseTables(input.edit.insertText);
  const ordinal =
    subsection ?? cvpEquipmentSubsectionOrdinal(cleaned) ?? null;
  if (!ordinal) {
    if (!cleaned || cleaned === input.edit.insertText) return null;
    return {
      ...input.edit,
      insertText: cleaned,
      anchorText: stripCvpEquipmentProseTables(input.edit.anchorText),
      deleteText: stripCvpEquipmentProseTables(input.edit.deleteText),
    };
  }

  const prose = cutAtNextSubsection(cleaned, ordinal);
  if (!prose) return null;
  const title = headingTitleFromInsert(cleaned, ordinal);
  const ordinalIndex = cvpEquipmentItemIndexFromTarget(ordinal);
  const fieldIndexes = equipmentIndexesInField(input.fieldDoc);
  if (
    ordinalIndex != null &&
    fieldIndexes.size > 0 &&
    !fieldIndexes.has(ordinalIndex)
  ) {
    return null;
  }
  const nodes = input.fieldDoc.content ?? [];
  const headingIndex = nodes.findIndex(
    (node) => subsectionOrdinalOfHeading(node) === ordinal
  );
  if (headingIndex >= 0) {
    return replacementForExistingHeading({
      heading: nodes[headingIndex]!,
      following: followingUntilBoundary(nodes, headingIndex),
      prose,
    });
  }

  const nextHeading = nodes.find((node) => {
    const other = subsectionOrdinalOfHeading(node);
    return other != null && compareSubsection(other, ordinal) > 0;
  });
  if (!nextHeading) return null;
  return replacementBeforeNextHeading({
    nextHeading,
    title,
    prose,
  });
}
