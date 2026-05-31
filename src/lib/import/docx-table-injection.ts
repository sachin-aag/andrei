import type { JSONContent } from "@tiptap/core";
import { SECTION_LABELS } from "@/types/sections";
import {
  type EditableKey,
  type ImportedSections,
  SECTION_ORDER,
} from "@/lib/import/docx-import-types";
import { escapeRegex } from "@/lib/import/docx-import-text";
import { parseHtmlTablesWithPositions, findDataTablePositions } from "@/lib/import/html-table-parser";
import {
  extractTableAlignmentSpecsFromDocxBuffer,
  mergeDocxAlignmentIntoTipTapTableFromSpecs,
} from "@/lib/import/docx-table-alignment";

/**
 * Split the mammoth HTML by section heading boundaries and inject any data
 * tables found within each section into the corresponding narrative JSONContent.
 */
export function injectTablesFromHtml(
  html: string,
  sections: ImportedSections,
  buffer: Buffer
): void {
  const tablesWithMeta = parseHtmlTablesWithPositions(html);
  const specs = extractTableAlignmentSpecsFromDocxBuffer(buffer);
  for (const { node } of tablesWithMeta) {
    mergeDocxAlignmentIntoTipTapTableFromSpecs(node, specs);
  }
  const tables = tablesWithMeta.map((t) => t.node);
  const tablePositions = findDataTablePositions(html);
  if (tables.length === 0) return;

  const sectionPositions: Array<{ key: EditableKey; index: number }> = [];
  for (const key of SECTION_ORDER) {
    const label = SECTION_LABELS[key];
    const headingRe = new RegExp(
      `<strong>\\s*${escapeRegex(label)}\\s*(?::|</strong>)`,
      "i"
    );
    const match = headingRe.exec(html);
    if (match) sectionPositions.push({ key, index: match.index });
  }
  sectionPositions.sort((a, b) => a.index - b.index);

  const tablesBySection = new Map<EditableKey, JSONContent[]>();
  for (let i = 0; i < tables.length; i++) {
    const tablePos = tablePositions[i]!;
    let sectionKey: EditableKey | null = null;
    for (let j = sectionPositions.length - 1; j >= 0; j--) {
      if (sectionPositions[j]!.index <= tablePos) {
        sectionKey = sectionPositions[j]!.key;
        break;
      }
    }
    if (sectionKey) {
      const list = tablesBySection.get(sectionKey) ?? [];
      list.push(tables[i]!);
      tablesBySection.set(sectionKey, list);
    }
  }

  for (const [sectionKey, sectionTables] of tablesBySection) {
    const section = sections[sectionKey];
    const narrative =
      "narrative" in section ? (section as { narrative: JSONContent }).narrative : null;
    if (!narrative || narrative.type !== "doc" || !narrative.content) continue;

    for (const tableNode of sectionTables) {
      if (isSignatureTipTapTable(tableNode)) continue;
      replaceFlatParagraphsWithTable(narrative, tableNode);
    }
  }
}

function isSignatureTipTapTable(tableNode: JSONContent): boolean {
  const cellTexts = extractTableCellTexts(tableNode);
  const joined = cellTexts.join(" ");
  return (
    /\bPrepared\b/i.test(joined) &&
    /\bSign\/Date\b/i.test(joined) &&
    (/\bReviewed\b/i.test(joined) || /\bApproved\b/i.test(joined))
  );
}

function extractTableCellTexts(tableNode: JSONContent): string[] {
  const texts: string[] = [];
  for (const row of tableNode.content ?? []) {
    for (const cell of row.content ?? []) {
      const cellTexts = extractCellParagraphTexts(cell);
      if (cellTexts.length > 0) texts.push(...cellTexts);
    }
  }
  return texts;
}

function extractCellParagraphTexts(node: JSONContent): string[] {
  if (node.type === "paragraph") {
    const text = extractParagraphTexts(node);
    return text ? [text] : [];
  }
  if (!node.content?.length) return [];
  return node.content.flatMap(extractCellParagraphTexts);
}

function extractParagraphTexts(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  if (!node.content?.length) return "";
  return node.content.map(extractParagraphTexts).join("").replace(/\s+/g, " ").trim();
}

function paragraphText(para: JSONContent): string {
  if (para.type === "text") return (para.text ?? "").trim();
  if (!para.content?.length) return "";
  return para.content.map(paragraphText).join("").trim();
}

function replaceFlatParagraphsWithTable(
  narrative: JSONContent,
  tableNode: JSONContent
): void {
  const cellTexts = extractTableCellTexts(tableNode);
  if (cellTexts.length === 0) return;

  const content = narrative.content;
  if (!content?.length) return;

  const cellTextSet = new Set(cellTexts);

  const firstHeaderText = cellTexts[0];
  if (!firstHeaderText) return;

  let anchorStart = -1;
  for (let i = 0; i < content.length; i++) {
    if (paragraphText(content[i]!) === firstHeaderText) {
      anchorStart = i;
      break;
    }
  }
  if (anchorStart === -1) return;

  let matchEnd = anchorStart;
  let matchedCells = 0;

  while (matchEnd < content.length) {
    const paraT = paragraphText(content[matchEnd]!);
    if (!paraT) {
      matchEnd++;
      continue;
    }
    if (cellTextSet.has(paraT)) {
      matchEnd++;
      matchedCells++;
    } else {
      break;
    }
  }

  if (matchedCells < Math.min(cellTexts.length, 3)) return;

  while (matchEnd < content.length && !paragraphText(content[matchEnd]!)) {
    matchEnd++;
  }

  content.splice(anchorStart, matchEnd - anchorStart, tableNode);
}
