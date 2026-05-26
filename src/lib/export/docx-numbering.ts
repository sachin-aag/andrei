import PizZip from "pizzip";
import type { ListStyle } from "@/lib/tiptap/list-style";
import type { DocxExportContext } from "@/lib/export/docx-export-context";

export type ListNumberingBases = {
  /** abstractNumId for decimal ordered lists */
  decimal: number;
  /** abstractNumId for filled-circle bullet lists */
  disc: number;
  /** abstractNumId for hyphen/dash-style bullet lists */
  dash: number;
  maxNumId: number;
};

type AbstractNumInfo = {
  id: number;
  numFmt: string;
  lvlText: string;
};

function parseAbstractNums(numberingXml: string): AbstractNumInfo[] {
  const out: AbstractNumInfo[] = [];
  const re =
    /<w:abstractNum w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  for (const m of numberingXml.matchAll(re)) {
    const id = Number(m[1]);
    const body = m[2] ?? "";
    const lvl = body.match(/<w:lvl w:ilvl="0"[^>]*>([\s\S]*?)<\/w:lvl>/);
    if (!lvl) continue;
    const numFmt = lvl[1]!.match(/w:numFmt w:val="([^"]+)"/)?.[1] ?? "";
    const lvlText = lvl[1]!.match(/w:lvlText w:val="([^"]*)"/)?.[1] ?? "";
    out.push({ id, numFmt, lvlText });
  }
  return out;
}

function maxNumIdInNumbering(numberingXml: string): number {
  let max = 0;
  for (const m of numberingXml.matchAll(/<w:num w:numId="(\d+)"/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Resolve abstractNumIds from template numbering.xml for export list cloning. */
export function parseListNumberingBases(numberingXml: string): ListNumberingBases {
  const abstracts = parseAbstractNums(numberingXml);
  const maxNumId = maxNumIdInNumbering(numberingXml);

  const decimalCandidates = abstracts.filter(
    (a) => a.numFmt === "decimal" && /%1/.test(a.lvlText)
  );
  const bulletCandidates = abstracts.filter((a) => a.numFmt === "bullet");

  const decimal = decimalCandidates[0]?.id ?? abstracts.find((a) => a.numFmt === "decimal")?.id ?? 0;
  const dash =
    bulletCandidates.find((a) => /-/.test(a.lvlText))?.id ??
    bulletCandidates[1]?.id ??
    bulletCandidates[0]?.id ??
    decimal;
  const disc =
    bulletCandidates.find((a) => a.id !== dash && a.numFmt === "bullet")?.id ??
    bulletCandidates[0]?.id ??
    dash;

  return { decimal, disc, dash, maxNumId };
}

export function loadListNumberingBasesFromZip(zip: PizZip): ListNumberingBases {
  const xml = zip.file("word/numbering.xml")?.asText() ?? "";
  if (!xml) {
    return { decimal: 0, disc: 0, dash: 0, maxNumId: 0 };
  }
  return parseListNumberingBases(xml);
}

function abstractIdForList(
  bases: ListNumberingBases,
  listType: "bulletList" | "orderedList",
  listStyle?: string | null
): number {
  if (listType === "orderedList") return bases.decimal;
  return listStyle === "dash" ? bases.dash : bases.disc;
}

/**
 * Allocate a fresh Word list instance (new w:numId) so numbering restarts per list block.
 */
export function allocateListNumId(
  ctx: DocxExportContext,
  listType: "bulletList" | "orderedList",
  listStyle?: string | null
): number {
  const bases = ctx.numberingBases;
  const abstractId = abstractIdForList(bases, listType, listStyle);
  const numId = ctx.nextNumId;
  ctx.nextNumId += 1;
  // Word keeps a running counter per abstractNumId unless each w:num restarts ilvl 0
  // (Google Docs restarts automatically). startOverride forces 1, 2, 3… per list block.
  ctx.numberingPatches.push(
    `<w:num w:numId="${numId}">` +
      `<w:abstractNumId w:val="${abstractId}"/>` +
      `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>` +
      `</w:num>`
  );
  ctx.allocatedNumIds.push(numId);
  return numId;
}

/** Append dynamically allocated w:num entries to word/numbering.xml. */
export function applyNumberingToDocxZip(zip: PizZip, ctx: DocxExportContext): void {
  if (ctx.numberingPatches.length === 0) return;
  const file = zip.file("word/numbering.xml");
  if (!file) return;
  const xml = file.asText();
  const insert = ctx.numberingPatches.join("");
  if (xml.includes("</w:numbering>")) {
    zip.file("word/numbering.xml", xml.replace("</w:numbering>", `${insert}</w:numbering>`));
  }
}

/** @internal exported for tests */
export function abstractIdForListStyle(
  bases: ListNumberingBases,
  listType: "bulletList" | "orderedList",
  listStyle?: ListStyle | null
): number {
  return abstractIdForList(bases, listType, listStyle);
}
