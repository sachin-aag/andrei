import type { JSONContent } from "@tiptap/core";
import { getUser } from "@/lib/auth/user-directory";
import {
  createDocxExportContext,
  registerInlineImage,
  type DocxExportContext,
} from "@/lib/export/docx-export-context";
import {
  sectionBreakParagraphXml,
  tableNeedsLandscapePage,
} from "@/lib/export/docx-page-setup";
import { allocateListNumId } from "@/lib/export/docx-numbering";
import { resolveOmmlFromMathAttrs } from "@/lib/math/omml-mathml";
import { quantityLatexToPlainText } from "@/lib/math/quantity-math";
import { simpleLatexToPlainText } from "@/lib/math/simple-latex";
import { stripWordBookmarkAnchors } from "@/lib/import/sanitize-import-html";
import { linesToDoc } from "@/lib/tiptap/rich-text";
import { tableRefDisplayText } from "@/lib/tiptap/table-ref-markdown";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { colorFromTextMarks, cssColorToWordVal } from "@/lib/tiptap/text-color";
import { citationNumbersFromDoc } from "@/lib/suggestions/citations-at-end";
import {
  applyCvpEmptyFirstColumnMerges,
  applyCvpSourceTableColWidths,
  CVP_PAGE_BREAK_XML,
  cvpHeadingCaps,
  cvpHeadingParagraphXml,
  stripTableCaptionNodes,
} from "@/lib/export/cvp-docx-format";

export type NarrativeDocxXmlResult = {
  xml: string;
  ctx: DocxExportContext;
};

/** Options for TipTap → OOXML conversion. */
export type NarrativeToDocxOptions = {
  /**
   * Put every table onto a landscape section even when column count would
   * still fit portrait (e.g. Convergent mechanical DV Req ID results tables).
   */
  forceLandscapeTables?: boolean;
};

/**
 * Convert a Tiptap JSONContent narrative document to OOXML (Word XML).
 * Paragraphs become `<w:p>` elements; table nodes become `<w:tbl>` with
 * proper borders and header-row shading. Returns raw XML suitable for
 * injection via docxtemplater's `{@rawXml}` syntax.
 */
export function narrativeToDocxXml(
  doc: JSONContent | undefined | null,
  ctx: DocxExportContext = createDocxExportContext(),
  options?: NarrativeToDocxOptions
): string {
  return narrativeToDocxXmlWithContext(doc, ctx, options).xml;
}

function sanitizeDocTextNodes(doc: JSONContent): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "text" && typeof node.text === "string") {
      return { ...node, text: stripWordBookmarkAnchors(node.text) };
    }
    if (node.content?.length) {
      return { ...node, content: node.content.map(visit) };
    }
    return node;
  }
  return visit(doc);
}

function nodePlainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlainText).join("");
}

/** `Table 1.` / `Table 1: Title` / `Table 1. Title` immediately above a grid. */
const TABLE_NAME_RE = /^Table\s+\d+\s*[.:]/i;
const TABLE_NAME_ONLY_RE = /^Table\s+\d+\.?\s*$/i;

function isTableNameNode(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  const text = nodePlainText(node).trim();
  return TABLE_NAME_RE.test(text) || TABLE_NAME_ONLY_RE.test(text);
}

function isEmptyExportNode(node: JSONContent | undefined): boolean {
  if (!node) return true;
  if (node.type === "table") return false;
  if (node.type === "bulletList" || node.type === "orderedList") {
    return !(node.content ?? []).some((child) => !isEmptyExportNode(child));
  }
  return !nodePlainText(node).trim();
}

function isTableTitleNode(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  const text = nodePlainText(node).trim();
  if (!text || isTableNameNode(node)) return false;
  // Numbered section headings (3.4 QUALIFICATION) are not table titles.
  return !/^\d+(\.\d+)*(\s|$)/.test(text);
}

/**
 * Index of the table name (and optional title) that must stay on the same
 * page as `tableIndex`. Word's section break describes the section that just
 * ended, so the break has to sit *before* those captions — not between them
 * and `<w:tbl>`.
 */
function tableHeaderStartIndex(
  nodes: JSONContent[],
  tableIndex: number
): number {
  let i = tableIndex;
  const skipEmpty = () => {
    while (i > 0 && isEmptyExportNode(nodes[i - 1])) i -= 1;
  };
  skipEmpty();
  if (
    i > 0 &&
    isTableTitleNode(nodes[i - 1]!) &&
    !isTableNameNode(nodes[i - 1]!)
  ) {
    const afterTitle = i;
    i -= 1;
    skipEmpty();
    if (!(i > 0 && isTableNameNode(nodes[i - 1]!))) {
      i = afterTitle;
    }
  }
  while (i > 0 && isTableNameNode(nodes[i - 1]!)) {
    i -= 1;
    skipEmpty();
  }
  return i;
}

function tableUsesLandscape(
  node: JSONContent,
  portraitMax: number,
  forceLandscapeTables: boolean
): boolean {
  const colCount = Math.max(1, getLogicalColumnCount(node.content ?? []));
  return (
    forceLandscapeTables || tableNeedsLandscapePage(colCount, portraitMax)
  );
}

export function narrativeToDocxXmlWithContext(
  doc: JSONContent | undefined | null,
  ctx: DocxExportContext = createDocxExportContext(),
  options?: NarrativeToDocxOptions
): NarrativeDocxXmlResult {
  if (!doc || !doc.content?.length) {
    return { xml: wrapParagraph("Not Applicable"), ctx };
  }

  let sanitized = sanitizeDocTextNodes(doc);
  if (ctx.mergeEmptyFirstColumn) {
    sanitized = applyCvpSourceTableColWidths(sanitized);
    sanitized = applyCvpEmptyFirstColumnMerges(sanitized);
  }
  if (ctx.stripTableCaptions) {
    sanitized = stripTableCaptionNodes(sanitized);
  }
  ctx.citationNumbers = citationNumbersFromDoc(sanitized);
  const parts: string[] = [];
  const portraitMax = portraitTableGridMax(ctx);
  const landscapeMax = ctx.pageSetup.landscapeContentWidthDxa;
  const forceLandscape = options?.forceLandscapeTables === true;
  const nodes = sanitized.content ?? [];
  const landscapeWithTable = new Set<number>();
  const keepWithTable = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]?.type !== "table") continue;
    const headerStart = tableHeaderStartIndex(nodes, i);
    for (let j = headerStart; j < i; j++) keepWithTable.add(j);
    if (tableUsesLandscape(nodes[i]!, portraitMax, forceLandscape)) {
      for (let j = headerStart; j <= i; j++) landscapeWithTable.add(j);
    }
  }
  let landscapeOpen = false;

  const closeLandscape = () => {
    if (!landscapeOpen) return;
    parts.push(sectionBreakParagraphXml(ctx.pageSetup.landscapeSectPr));
    landscapeOpen = false;
  };
  const openLandscape = () => {
    if (landscapeOpen) return;
    parts.push(sectionBreakParagraphXml(ctx.pageSetup.portraitSectPr));
    landscapeOpen = true;
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type === "table") {
      if (landscapeWithTable.has(i)) {
        openLandscape();
        parts.push(tableToXml(node, ctx, landscapeMax));
      } else {
        closeLandscape();
        parts.push(tableToXml(node, ctx, portraitMax));
      }
      continue;
    }
    // forceLandscapeTables: keep trailing paragraphs (table footnotes) in
    // the same landscape section. Word's sectPr describes the section that
    // just ended, so the footnote must sit *before* the landscape break.
    // Table name/title captions of a landscape table also stay in that
    // section — open the break before the caption, not before `<w:tbl>`.
    if (landscapeWithTable.has(i)) {
      openLandscape();
    } else if (!(forceLandscape && landscapeOpen)) {
      closeLandscape();
    }
    const keepNext = keepWithTable.has(i);
    if (node.type === "paragraph") {
      parts.push(paragraphToXml(node, false, null, null, keepNext, ctx));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      parts.push(listToXml(node, ctx));
    } else if (node.type === "heading") {
      parts.push(headingToXml(node, ctx, keepNext));
    } else if (node.type === "mathBlock") {
      parts.push(mathBlockToXml(node));
    } else {
      parts.push(paragraphToXml(node, false, null, null, keepNext, ctx));
    }
  }
  closeLandscape();

  const result = parts.join("");
  return { xml: result || wrapParagraph("Not Applicable"), ctx };
}

/** Plain multiline text (markdown-style list markers) → Word XML. */
export function plainTextToDocxXml(
  text: string | undefined | null,
  ctx: DocxExportContext = createDocxExportContext()
): string {
  const trimmed = stripWordBookmarkAnchors(text?.trim() ?? "");
  if (!trimmed) return wrapParagraph("Not Applicable");
  return narrativeToDocxXmlWithContext(linesToDoc(trimmed), ctx).xml;
}

const DEFAULT_RUN_FONT = "Times New Roman";
const DEFAULT_RUN_SIZE_HALF_POINTS = "24";

type SuggestionRevision = {
  id: string;
  author: string;
  date: string;
  type: typeof suggestionInsertMarkName | typeof suggestionDeleteMarkName;
};

function revisionIdFromMarkId(markId: unknown): string {
  const source = typeof markId === "string" && markId ? markId : "0";
  if (/^\d+$/.test(source)) return source;
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return String(hash || 1);
}

function revisionAuthorFromId(authorId: unknown): string {
  if (typeof authorId !== "string") return "Unknown";
  const trimmed = authorId.trim();
  if (!trimmed) return "Unknown";
  if (trimmed === "ai") return "AI reviewer";
  return getUser(trimmed)?.name ?? trimmed;
}

function suggestionRevisionFromMarks(
  marks: JSONContent["marks"]
): SuggestionRevision | null {
  const mark =
    marks?.find((m) => m.type === suggestionDeleteMarkName) ??
    marks?.find((m) => m.type === suggestionInsertMarkName);
  if (!mark) return null;
  return {
    id: revisionIdFromMarkId(mark.attrs?.id),
    author: revisionAuthorFromId(mark.attrs?.authorId),
    date:
      typeof mark.attrs?.createdAt === "string" && mark.attrs.createdAt.trim()
        ? mark.attrs.createdAt.trim()
        : new Date(0).toISOString(),
    type: mark.type as SuggestionRevision["type"],
  };
}

function revisionWrapper(revision: SuggestionRevision, inner: string): string {
  const tag = revision.type === suggestionDeleteMarkName ? "w:del" : "w:ins";
  return `<${tag} w:id="${escapeXml(revision.id)}" w:author="${escapeXml(
    revision.author
  )}" w:date="${escapeXml(revision.date)}">${inner}</${tag}>`;
}

/**
 * Fallback table grid width in dxa (twips) when page setup is missing:
 * A4 pgSz 11909 − left/right pgMar 720 each = 10469.
 */
const TABLE_GRID_TOTAL_MAX_DXA = 10469;

/** Minimum per-column width in dxa so cells stay readable after scaling. */
const TABLE_GRID_MIN_COL_DXA = 180;

function normalizeGridColWidths(widths: number[], maxTotalDxa: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum <= maxTotalDxa) return widths;

  const scale = maxTotalDxa / sum;
  const scaled = widths.map((w) =>
    Math.max(TABLE_GRID_MIN_COL_DXA, Math.round(w * scale))
  );
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const drift = maxTotalDxa - scaledSum;
  if (drift !== 0 && scaled.length > 0) {
    const last = scaled.length - 1;
    scaled[last] = Math.max(
      TABLE_GRID_MIN_COL_DXA,
      scaled[last]! + drift
    );
  }
  return scaled;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Word Online collapses a space that sits at the edge of a formatted run
 * (`w:b` / `w:i` / underline) even when `xml:space="preserve"` is set.
 * Put those spaces in their own unformatted run so "associated **Tray Loader**"
 * does not export as "associatedTray Loader".
 */
function splitEdgeWhitespace(text: string): {
  lead: string;
  middle: string;
  trail: string;
} {
  if (!text) return { lead: "", middle: "", trail: "" };
  if (/^\s+$/.test(text)) return { lead: "", middle: "", trail: text };
  const lead = text.match(/^\s+/)?.[0] ?? "";
  const rest = text.slice(lead.length);
  const trail = rest.match(/\s+$/)?.[0] ?? "";
  return { lead, middle: rest.slice(0, rest.length - trail.length), trail };
}

function visualEmphasisKey(node: JSONContent | undefined, forceBold: boolean): string {
  if (!node) return "none";
  if (node.type === "text" || node.type === "tableRef") {
    const marks = node.marks ?? [];
    const bold = forceBold || marks.some((m) => m.type === "bold");
    const italic = marks.some((m) => m.type === "italic");
    const underline = marks.some((m) => m.type === "underline");
    const subscript = marks.some((m) => m.type === "subscript");
    const superscript = marks.some((m) => m.type === "superscript");
    const color = colorFromTextMarks(marks) ?? "";
    return `b${bold}|i${italic}|u${underline}|sub${subscript}|sup${superscript}|c${color}`;
  }
  if (node.type === "mathInline") return "math";
  if (node.type === "imageInline") return "image";
  return "none";
}

function stripKnownCitationMarkers(
  line: string,
  citationNumbers: ReadonlySet<number>
): string {
  const stripped = line.replace(/\[(\d+)\]/g, (match, raw: string) =>
    citationNumbers.has(Number(raw)) ? "" : match
  );
  return stripped.replace(/[ \t]+([.,;:])/g, "$1").replace(/ {2,}/g, " ");
}

function textLineToCitationAwareRuns(
  line: string,
  rPr: string,
  textTag: "w:t" | "w:delText",
  superscriptRPr: string,
  citationNumbers: ReadonlySet<number> | undefined,
  stripMarkers = false
): string {
  if (!line) return "";
  if (!citationNumbers || citationNumbers.size === 0) {
    return `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(line)}</${textTag}></w:r>`;
  }
  if (stripMarkers) {
    const cleaned = stripKnownCitationMarkers(line, citationNumbers);
    if (!cleaned) return "";
    return `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(cleaned)}</${textTag}></w:r>`;
  }

  const parts: string[] = [];
  const markerRe = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(line)) !== null) {
    const n = Number(match[1]);
    if (!citationNumbers.has(n)) continue;
    if (match.index > last) {
      parts.push(
        `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(
          line.slice(last, match.index)
        )}</${textTag}></w:r>`
      );
    }
    parts.push(
      `<w:r>${superscriptRPr}<${textTag} xml:space="preserve">${escapeXml(
        String(n)
      )}</${textTag}></w:r>`
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) {
    return `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(line)}</${textTag}></w:r>`;
  }
  if (last < line.length) {
    parts.push(
      `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(
        line.slice(last)
      )}</${textTag}></w:r>`
    );
  }
  return parts.join("");
}

function paragraphJustification(
  align?: string | null,
  ctx?: DocxExportContext
): string {
  const val =
    align === "center" ||
    align === "right" ||
    align === "left" ||
    align === "both"
      ? align
      : (ctx?.paragraphAlign ?? "left");
  return `<w:jc w:val="${val}"/>`;
}

function paragraphProperties(
  align?: string | null,
  numId?: number | null,
  keepNext?: boolean,
  ctx?: DocxExportContext,
  extras?: { ilvl?: number; inTable?: boolean }
): string {
  const inTable = extras?.inTable === true;
  const ilvl = extras?.ilvl ?? 0;
  const jc = paragraphJustification(align, ctx);
  const keep = keepNext ? "<w:keepNext/>" : "";
  let style = "";
  if (numId && inTable && ctx?.inTableListParagraphStyle) {
    style = `<w:pStyle w:val="${ctx.inTableListParagraphStyle}"/>`;
  } else if (numId && ctx?.listParagraphStyle) {
    style = `<w:pStyle w:val="ListParagraph"/>`;
  } else if (!numId && !inTable && ctx?.bodyParagraphStyle) {
    style = `<w:pStyle w:val="${ctx.bodyParagraphStyle}"/>`;
  }
  const indent =
    numId && inTable && ctx?.tableListIndentLeft
      ? `<w:ind w:left="${ctx.tableListIndentLeft}" w:hanging="${ctx.tableListIndentHanging ?? "0"}"/>`
      : "";
  const before = inTable ? null : ctx?.paragraphSpacingBefore;
  const after = inTable ? null : ctx?.paragraphSpacingAfter;
  const line = !inTable && ctx?.paragraphLine
    ? ` w:line="${ctx.paragraphLine}" w:lineRule="${ctx.paragraphLineRule ?? "auto"}"`
    : "";
  const spacing =
    before || after || line
      ? `<w:spacing w:before="${before ?? "0"}" w:after="${after ?? "0"}"${line}/>`
      : "";
  const num = numId
    ? `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`
    : "";
  return `<w:pPr>${style}${keep}${spacing}${indent}${jc}${num}</w:pPr>`;
}

function wrapParagraph(text: string, ctx?: DocxExportContext): string {
  return `<w:p>${paragraphProperties(null, null, false, ctx)}<w:r>${runProperties({}, ctx)}<w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p>`;
}

function headingStyleName(
  level: unknown
): "Heading1" | "Heading2" | "Heading3" | "Heading4" {
  const n = typeof level === "number" ? level : Number(level);
  if (n <= 1 || Number.isNaN(n)) return "Heading1";
  if (n === 2) return "Heading2";
  if (n === 3) return "Heading3";
  return "Heading4";
}

function headingToXml(
  node: JSONContent,
  ctx: DocxExportContext,
  keepNext = false
): string {
  if (!ctx.useHeadingStyles) {
    return paragraphToXml(node, true, null, null, keepNext, ctx);
  }
  if (ctx.headingOutline === "cvp") {
    return cvpContentHeadingToXml(node, ctx, keepNext);
  }
  const style = headingStyleName(node.attrs?.level);
  const runs = inlineNodesToRuns(node.content ?? [], false, ctx);
  const keep = keepNext ? "<w:keepNext/>" : "";
  const pPr = `<w:pPr><w:pStyle w:val="${style}"/>${keep}${paragraphJustification(null, ctx)}</w:pPr>`;
  if (!runs) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function cvpContentHeadingToXml(
  node: JSONContent,
  ctx: DocxExportContext,
  keepNext: boolean
): string {
  const raw = nodePlainText(node).trim();
  if (!raw) return "";
  const level = Number(node.attrs?.level);
  if (level >= 3 || Number.isNaN(level)) {
    return paragraphToXml(
      { ...node, type: "paragraph" },
      true,
      null,
      null,
      keepNext,
      ctx
    );
  }
  const ilvl: 0 | 1 = level <= 1 ? 0 : 1;
  const xml = cvpHeadingParagraphXml(cvpHeadingCaps(raw), ilvl);
  if (level === 2 && ctx.pageBreakBeforeHeading2) {
    return CVP_PAGE_BREAK_XML + xml;
  }
  return xml;
}

function paragraphToXml(
  node: JSONContent,
  bold = false,
  paragraphAlign?: string | null,
  numId?: number | null,
  keepNext = false,
  ctx?: DocxExportContext,
  runSizeOverride?: string,
  extras?: { ilvl?: number; inTable?: boolean }
): string {
  const runs = inlineNodesToRuns(node.content ?? [], bold, ctx, runSizeOverride);
  const pPr = paragraphProperties(
    paragraphAlign,
    numId,
    keepNext,
    ctx,
    extras
  );
  if (!runs) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function boundarySpaceRun(
  whitespace: string,
  textTag: "w:t" | "w:delText",
  ctx: DocxExportContext | undefined,
  runSizeOverride?: string
): string {
  if (!whitespace) return "";
  const rPr = runProperties({ sizeHalfPoints: runSizeOverride, noProof: true }, ctx);
  return `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(whitespace)}</${textTag}></w:r>`;
}

function inlineNodesToRuns(
  nodes: JSONContent[],
  forceBold = false,
  ctx?: DocxExportContext,
  runSizeOverride?: string
): string {
  const parts: string[] = [];
  let emittedBoundarySpace = false;

  for (let index = 0; index < nodes.length; index++) {
    const child = nodes[index]!;
    if (child.type === "text") {
      const text = child.text ?? "";
      if (!text) continue;
      const marks = child.marks ?? [];
      const isBold =
        forceBold || marks.some((m) => m.type === "bold");
      const isItalic = marks.some((m) => m.type === "italic");
      const isUnderline = marks.some((m) => m.type === "underline");
      const isSubscript = marks.some((m) => m.type === "subscript");
      const isSuperscript = marks.some((m) => m.type === "superscript");
      const revision = suggestionRevisionFromMarks(marks);
      const textTag: "w:t" | "w:delText" =
        revision?.type === suggestionDeleteMarkName ? "w:delText" : "w:t";
      const thisKey = visualEmphasisKey(child, forceBold);
      const prevKey = visualEmphasisKey(nodes[index - 1], forceBold);
      const nextKey = visualEmphasisKey(nodes[index + 1], forceBold);
      const isolateLead = thisKey !== prevKey;
      const isolateTrail = thisKey !== nextKey;

      const rPr = runProperties({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        subscript: isSubscript,
        superscript: isSuperscript,
        color: colorFromTextMarks(marks),
        sizeHalfPoints: runSizeOverride,
      }, ctx);
      const superscriptRPr = runProperties({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        subscript: false,
        superscript: true,
        color: colorFromTextMarks(marks),
        sizeHalfPoints: runSizeOverride,
      }, ctx);

      const lines = text.split("\n");
      const runParts: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          runParts.push(`<w:r>${rPr}<w:br/></w:r>`);
          emittedBoundarySpace = false;
        }
        const line = lines[i]!;
        if (!line) continue;
        const { lead, middle, trail } = splitEdgeWhitespace(line);
        if (!middle) {
          const ws = lead + trail;
          const isolate = thisKey !== prevKey || thisKey !== nextKey;
          if (isolate) {
            if (!emittedBoundarySpace) {
              runParts.push(boundarySpaceRun(ws, textTag, ctx, runSizeOverride));
            }
            emittedBoundarySpace = true;
          } else if (ws) {
            runParts.push(
              textLineToCitationAwareRuns(
                ws,
                rPr,
                textTag,
                superscriptRPr,
                ctx?.citationNumbers,
                ctx?.stripInTextCitationMarkers === true
              )
            );
            emittedBoundarySpace = false;
          }
          continue;
        }
        let core = middle;
        if (lead && !isolateLead) core = lead + core;
        if (trail && !isolateTrail) core = core + trail;
        if (lead && isolateLead && !emittedBoundarySpace) {
          runParts.push(boundarySpaceRun(lead, textTag, ctx, runSizeOverride));
          emittedBoundarySpace = true;
        }
        if (core) {
          runParts.push(
            textLineToCitationAwareRuns(
              core,
              rPr,
              textTag,
              superscriptRPr,
              ctx?.citationNumbers,
              ctx?.stripInTextCitationMarkers === true
            )
          );
          emittedBoundarySpace = false;
        }
        if (trail && isolateTrail) {
          runParts.push(boundarySpaceRun(trail, textTag, ctx, runSizeOverride));
          emittedBoundarySpace = true;
        }
      }
      const runXml = runParts.join("");
      parts.push(
        revision && runXml ? revisionWrapper(revision, runXml) : runXml
      );
    } else if (child.type === "hardBreak") {
      parts.push(`<w:r>${runProperties({ sizeHalfPoints: runSizeOverride }, ctx)}<w:br/></w:r>`);
      emittedBoundarySpace = false;
    } else if (child.type === "imageInline" && ctx) {
      const src = child.attrs?.src as string | undefined;
      if (src) {
        const width = child.attrs?.width as number | undefined;
        parts.push(registerInlineImage(ctx, src, width));
      }
      emittedBoundarySpace = false;
    } else if (child.type === "mathInline") {
      parts.push(mathInlineToRun(child, ctx));
      emittedBoundarySpace = false;
    } else if (child.type === "tableRef") {
      const label = tableRefDisplayText({
        n: typeof child.attrs?.n === "number" ? child.attrs.n : null,
      });
      const marks = child.marks ?? [];
      const revision = suggestionRevisionFromMarks(marks);
      const rPr = runProperties(
        {
          bold: forceBold || marks.some((m) => m.type === "bold"),
          italic: marks.some((m) => m.type === "italic"),
          underline: marks.some((m) => m.type === "underline"),
          sizeHalfPoints: runSizeOverride,
        },
        ctx
      );
      const runXml = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>`;
      parts.push(revision && runXml ? revisionWrapper(revision, runXml) : runXml);
      emittedBoundarySpace = false;
    }
  }

  return parts.join("");
}

function mathOmmlFromNode(node: JSONContent): string {
  return resolveOmmlFromMathAttrs({
    mathml: node.attrs?.mathml as string | undefined,
    latex: node.attrs?.latex as string | undefined,
    omml: node.attrs?.omml as string | undefined,
    ommlDirty: node.attrs?.ommlDirty as boolean | undefined,
  });
}

function mathPlainFromNode(node: JSONContent): string | null {
  const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
  return quantityLatexToPlainText(latex) ?? simpleLatexToPlainText(latex);
}

function mathTextRun(text: string, ctx?: DocxExportContext): string {
  return `<w:r>${runProperties({}, ctx)}<w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r>`;
}

/**
 * Quantity TeX (`$<1$`, `$\pm 0.5\%$`) becomes Unicode `w:t` so Word never
 * sees an unescaped `<` in OMML. Remaining equations stay OMML (already
 * XML-escaped). Never return empty — stripped math was leaving holes in
 * §5.3 / §6.0 prose.
 */
function mathInlineToRun(node: JSONContent, ctx?: DocxExportContext): string {
  const plain = mathPlainFromNode(node);
  if (plain) return mathTextRun(plain, ctx);
  const omml = mathOmmlFromNode(node);
  if (omml) {
    const inner = omml.startsWith("<m:oMath") ? omml : `<m:oMath>${omml}</m:oMath>`;
    return `<w:r>${runProperties({}, ctx)}${inner}</w:r>`;
  }
  const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex.trim() : "";
  return mathTextRun(latex || "[equation]", ctx);
}

function mathBlockToXml(node: JSONContent): string {
  const plain = mathPlainFromNode(node);
  if (plain) return wrapParagraph(plain);
  const omml = mathOmmlFromNode(node);
  if (!omml) {
    const latex =
      typeof node.attrs?.latex === "string" ? node.attrs.latex.trim() : "";
    return wrapParagraph(latex || "[equation]");
  }
  const inner = omml.startsWith("<m:oMath") ? omml : `<m:oMath>${omml}</m:oMath>`;
  return `<w:p>${paragraphProperties()}<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMathPara></w:p>`;
}

function runProperties(
  options: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    subscript?: boolean;
    superscript?: boolean;
    sizeHalfPoints?: string;
    noProof?: boolean;
  } = {},
  ctx?: DocxExportContext
): string {
  const font = ctx?.runFont ?? DEFAULT_RUN_FONT;
  const size =
    options.sizeHalfPoints ??
    ctx?.runSizeHalfPoints ??
    DEFAULT_RUN_SIZE_HALF_POINTS;
  let rPr =
    `<w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" ` +
    `w:hAnsi="${font}" w:cs="${font}"/>` +
    `<w:sz w:val="${size}"/>` +
    `<w:szCs w:val="${size}"/>`;
  if (options.bold) rPr += "<w:b/>";
  if (options.italic) rPr += "<w:i/>";
  if (options.underline) rPr += '<w:u w:val="single"/>';
  const wordColor = ctx?.forceBlackText
    ? "000000"
    : cssColorToWordVal(options.color);
  if (wordColor) rPr += `<w:color w:val="${wordColor}"/>`;
  if (options.subscript) rPr += '<w:vertAlign w:val="subscript"/>';
  if (options.superscript) rPr += '<w:vertAlign w:val="superscript"/>';
  if (options.noProof) rPr += "<w:noProof/>";
  rPr += "</w:rPr>";
  return rPr;
}

type ListXmlOptions = {
  bold?: boolean;
  align?: string | null;
  keepNext?: boolean;
  runSize?: string;
  inTable?: boolean;
  ilvl?: number;
  numId?: number | null;
};

function listToXml(
  node: JSONContent,
  ctx: DocxExportContext | undefined,
  options: ListXmlOptions = {}
): string {
  const listType = node.type === "orderedList" ? "orderedList" : "bulletList";
  const ilvl = options.ilvl ?? 0;
  const numId =
    options.numId ??
    (ctx
      ? allocateListNumId(
          ctx,
          listType,
          (node.attrs?.listStyle as string | undefined) ?? null
        )
      : null);
  const parts: string[] = [];
  for (const item of node.content ?? []) {
    if (item.type !== "listItem") continue;
    let numbered = true;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        const nestedSameType = child.type === node.type;
        parts.push(
          listToXml(child, ctx, {
            ...options,
            ilvl: nestedSameType ? ilvl + 1 : 0,
            numId: nestedSameType ? numId : undefined,
          })
        );
        continue;
      }
      parts.push(
        paragraphToXml(
          child,
          options.bold ?? false,
          options.align ?? null,
          numbered ? numId : null,
          options.keepNext ?? false,
          ctx,
          options.runSize,
          { ilvl, inTable: options.inTable === true }
        )
      );
      numbered = false;
    }
  }
  return parts.join("");
}

function portraitTableGridMax(ctx: DocxExportContext): number {
  return (
    ctx.tableGridMaxDxa ??
    ctx.pageSetup.portraitContentWidthDxa ??
    TABLE_GRID_TOTAL_MAX_DXA
  );
}

function tableToXml(
  node: JSONContent,
  ctx?: DocxExportContext,
  maxGridDxa?: number
): string {
  const gridMax =
    maxGridDxa ??
    ctx?.tableGridMaxDxa ??
    ctx?.pageSetup.portraitContentWidthDxa ??
    TABLE_GRID_TOTAL_MAX_DXA;
  const inner = buildInnerTableXml(node, ctx, gridMax);
  if (!inner) return "";
  if (ctx && ctx.tableKeepTogetherWrapper === false) {
    return inner;
  }

  // Wrap the real table inside a single-row, single-cell, borderless table
  // marked <w:cantSplit/>. Word treats the wrapper row as atomic, which keeps
  // the inner table together across page breaks. If the wrapper row is taller
  // than one page Word ignores cantSplit and splits the inner table anyway,
  // which is the desired escape hatch for genuinely oversize tables.
  const wrapperTblPr = `<w:tblPr>` +
    `<w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="nil"/>` +
    `<w:left w:val="nil"/>` +
    `<w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/>` +
    `<w:insideH w:val="nil"/>` +
    `<w:insideV w:val="nil"/>` +
    `</w:tblBorders>` +
    `<w:tblCellMar>` +
    `<w:top w:w="0" w:type="dxa"/>` +
    `<w:left w:w="0" w:type="dxa"/>` +
    `<w:bottom w:w="0" w:type="dxa"/>` +
    `<w:right w:w="0" w:type="dxa"/>` +
    `</w:tblCellMar>` +
    `<w:tblLook w:val="04A0" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>` +
    `</w:tblPr>`;
  const wrapperGrid = `<w:tblGrid><w:gridCol w:w="${gridMax}"/></w:tblGrid>`;
  const wrapperCell =
    `<w:tc>` +
    `<w:tcPr><w:tcW w:w="5000" w:type="pct"/>` +
    `<w:tcMar>` +
    `<w:top w:w="0" w:type="dxa"/>` +
    `<w:left w:w="0" w:type="dxa"/>` +
    `<w:bottom w:w="0" w:type="dxa"/>` +
    `<w:right w:w="0" w:type="dxa"/>` +
    `</w:tcMar>` +
    `</w:tcPr>` +
    inner +
    // Word requires a trailing paragraph in every cell. Zero spacing keeps
    // the wrapper from adding visible whitespace below the real table.
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>` +
    `</w:tc>`;
  const wrapperRow = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${wrapperCell}</w:tr>`;
  return `<w:tbl>${wrapperTblPr}${wrapperGrid}${wrapperRow}</w:tbl>`;
}

function buildInnerTableXml(
  node: JSONContent,
  ctx: DocxExportContext | undefined,
  maxGridDxa: number
): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const colCount = Math.max(1, getLogicalColumnCount(rows));

  const colWidthsRaw = node.attrs?.colWidths as unknown;
  let storedWidths: number[] | null = null;
  if (Array.isArray(colWidthsRaw) && colWidthsRaw.length === colCount) {
    const nums = colWidthsRaw.filter(
      (x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0
    );
    if (nums.length === colCount) storedWidths = nums;
  }

  const perColFallback = Math.max(
    360,
    Math.floor(maxGridDxa / colCount)
  );
  const rawWidths = storedWidths
    ? storedWidths
    : Array.from({ length: colCount }, () => perColFallback);
  const colWidths = normalizeGridColWidths(rawWidths, maxGridDxa);
  const gridTotalDxa = colWidths.reduce((a, b) => a + b, 0);
  const gridColXmlParts = colWidths.map(
    (w) => `<w:gridCol w:w="${Math.round(w)}"/>`
  );
  const tblGrid = `<w:tblGrid>${gridColXmlParts.join("")}</w:tblGrid>`;

  const borderColor = ctx?.tableBorderColor ?? "auto";
  const tblW = ctx?.tableWidthPct
    ? `<w:tblW w:w="${ctx.tableWidthPct}" w:type="pct"/>`
    : `<w:tblW w:w="${gridTotalDxa}" w:type="dxa"/>`;
  const tblJc = ctx?.tableJustify
    ? `<w:jc w:val="${ctx.tableJustify}"/>`
    : "";
  const tblLayout = storedWidths
    ? `<w:tblLayout w:type="fixed"/>`
    : "";

  // Nested inside the keep-together wrapper: explicit dxa width prevents Word
  // from honoring an oversized imported tblGrid sum and clipping the right edge.
  const tblPr = `<w:tblPr>
<w:tblStyle w:val="TableGrid"/>
${tblW}
${tblLayout}
${tblJc}
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
</w:tblBorders>
<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
</w:tblPr>`;

  const activeMerges: (ActiveRowMerge | null)[] = [];
  const rowsXml = rows
    .map((row, rowIdx) =>
      tableRowToXml(
        row,
        rowIdx === 0,
        rowIdx === rows.length - 1,
        activeMerges,
        colCount,
        ctx
      )
    )
    .join("");

  return `<w:tbl>${tblPr}${tblGrid}${rowsXml}</w:tbl>`;
}

type ActiveRowMerge = {
  cell: JSONContent;
  colspan: number;
  remainingRows: number;
};

function tableRowToXml(
  row: JSONContent,
  isHeader: boolean,
  isLastRow: boolean,
  activeMerges: (ActiveRowMerge | null)[],
  colCount: number,
  ctx?: DocxExportContext
): string {
  const cells = row.content ?? [];
  // Always set cantSplit so a single row never breaks mid-content across pages.
  // Header rows additionally repeat at the top of each page if the table spills.
  let trPr = "<w:trPr><w:cantSplit/>";
  if (isHeader) trPr += "<w:tblHeader/>";
  if (ctx?.tableJustify) trPr += `<w:jc w:val="${ctx.tableJustify}"/>`;
  trPr += "</w:trPr>";
  const consumedMerges = new Set<ActiveRowMerge>();
  const cellsXml: string[] = [];
  let col = 0;

  const emitActiveMerge = () => {
    const merge = activeMerges[col];
    if (!merge) return false;

    const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
    if (isMergeStart) {
      cellsXml.push(
        tableCellToXml(merge.cell, isHeader, isLastRow, ctx, {
          colspan: merge.colspan,
          vMerge: "continue",
          empty: true,
        })
      );
      consumedMerges.add(merge);
      col += merge.colspan;
    } else {
      col++;
    }

    return true;
  };

  for (const cell of cells) {
    while (col < colCount && activeMerges[col]) {
      emitActiveMerge();
    }

    const colspan = getSpan(cell, "colspan");
    const rowspan = getSpan(cell, "rowspan");
    cellsXml.push(
      tableCellToXml(cell, isHeader, isLastRow, ctx, {
        colspan,
        vMerge: rowspan > 1 ? "restart" : null,
      })
    );

    if (rowspan > 1) {
      const merge: ActiveRowMerge = {
        cell,
        colspan,
        remainingRows: rowspan - 1,
      };
      for (let i = 0; i < colspan; i++) {
        activeMerges[col + i] = merge;
      }
    }

    col += colspan;
  }

  while (col < colCount) {
    if (!emitActiveMerge()) {
      cellsXml.push(
        tableCellToXml({ type: "tableCell", content: [] }, isHeader, isLastRow, ctx)
      );
      col++;
    }
  }

  consumeActiveMerges(activeMerges, consumedMerges);

  return `<w:tr>${trPr}${cellsXml.join("")}</w:tr>`;
}

function tableCellToXml(
  cell: JSONContent,
  isHeader: boolean,
  isLastRow: boolean,
  ctx?: DocxExportContext,
  options: {
    colspan?: number;
    vMerge?: "restart" | "continue" | null;
    empty?: boolean;
  } = {}
): string {
  const hAlign = cell.attrs?.align as string | undefined;
  const vAttr = cell.attrs?.verticalAlign as string | undefined;
  const vWord =
    vAttr === "middle"
      ? "center"
      : vAttr === "top" || vAttr === "bottom"
        ? vAttr
        : (ctx?.tableCellVAlign ?? null);

  let tcPr = "<w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/>";
  if (options.colspan && options.colspan > 1) {
    tcPr += `<w:gridSpan w:val="${options.colspan}"/>`;
  }
  if (options.vMerge) {
    tcPr += `<w:vMerge w:val="${options.vMerge}"/>`;
  }
  if (isHeader) {
    tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${ctx?.tableHeaderFill ?? "D9E2F3"}"/>`;
  }
  if (vWord) {
    tcPr += `<w:vAlign w:val="${vWord}"/>`;
  }
  tcPr += "</w:tcPr>";

  // keepNext on every paragraph in every non-last row asks Word to keep the
  // table together when it fits on a single page, while still allowing a
  // genuine split when the table is too tall for one page.
  const keepNext =
    ctx?.tableCellKeepNext === false ? false : !isLastRow;
  const paragraphs = options.empty ? [] : cell.content ?? [];
  const cellAlign = isHeader
    ? (hAlign ?? ctx?.tableHeaderAlign ?? "left")
    : (hAlign ?? "left");
  const cellSize = ctx?.tableCellSizeHalfPoints ?? undefined;
  const cellExtras = { inTable: true };
  const content = paragraphs
    .map((block) => {
      if (block.type === "bulletList" || block.type === "orderedList") {
        return listToXml(block, ctx, {
          bold: isHeader,
          align: cellAlign,
          keepNext,
          runSize: cellSize,
          inTable: true,
        });
      }
      if (block.type === "paragraph") {
        return paragraphToXml(
          block,
          isHeader,
          cellAlign,
          null,
          keepNext,
          ctx,
          cellSize,
          cellExtras
        );
      }
      return paragraphToXml(
        block,
        false,
        cellAlign,
        null,
        keepNext,
        ctx,
        cellSize,
        cellExtras
      );
    })
    .join("");

  // Word requires at least one paragraph in each cell
  const cellContent =
    content ||
    `<w:p>${paragraphProperties(cellAlign, null, keepNext, ctx, cellExtras)}</w:p>`;
  return `<w:tc>${tcPr}${cellContent}</w:tc>`;
}

function getLogicalColumnCount(rows: JSONContent[]): number {
  const activeMerges: (ActiveRowMerge | null)[] = [];
  let maxCols = 0;

  for (const row of rows) {
    const consumedMerges = new Set<ActiveRowMerge>();
    let col = 0;

    const skipActiveMerge = () => {
      const merge = activeMerges[col];
      if (!merge) return false;
      const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
      if (isMergeStart) {
        consumedMerges.add(merge);
        col += merge.colspan;
      } else {
        col++;
      }
      return true;
    };

    for (const cell of row.content ?? []) {
      while (activeMerges[col]) skipActiveMerge();

      const colspan = getSpan(cell, "colspan");
      const rowspan = getSpan(cell, "rowspan");
      if (rowspan > 1) {
        const merge: ActiveRowMerge = {
          cell,
          colspan,
          remainingRows: rowspan - 1,
        };
        for (let i = 0; i < colspan; i++) {
          activeMerges[col + i] = merge;
        }
      }
      col += colspan;
    }

    while (activeMerges[col]) skipActiveMerge();
    if (col > maxCols) maxCols = col;
    consumeActiveMerges(activeMerges, consumedMerges);
  }

  return maxCols;
}

function consumeActiveMerges(
  activeMerges: (ActiveRowMerge | null)[],
  consumedMerges: Set<ActiveRowMerge>
) {
  for (const merge of consumedMerges) {
    merge.remainingRows -= 1;
    if (merge.remainingRows <= 0) {
      for (let i = 0; i < activeMerges.length; i++) {
        if (activeMerges[i] === merge) activeMerges[i] = null;
      }
    }
  }
}

function getSpan(cell: JSONContent, key: "colspan" | "rowspan"): number {
  const raw = (cell.attrs as { colspan?: number; rowspan?: number } | undefined)?.[key];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1) return Math.floor(raw);
  return 1;
}
