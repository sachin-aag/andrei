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
import { stripWordBookmarkAnchors } from "@/lib/import/sanitize-import-html";
import { linesToDoc } from "@/lib/tiptap/rich-text";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { colorFromTextMarks, cssColorToWordVal } from "@/lib/tiptap/text-color";
import { citationNumbersFromDoc } from "@/lib/suggestions/citations-at-end";

export type NarrativeDocxXmlResult = {
  xml: string;
  ctx: DocxExportContext;
};

/**
 * Convert a Tiptap JSONContent narrative document to OOXML (Word XML).
 * Paragraphs become `<w:p>` elements; table nodes become `<w:tbl>` with
 * proper borders and header-row shading. Returns raw XML suitable for
 * injection via docxtemplater's `{@rawXml}` syntax.
 */
export function narrativeToDocxXml(
  doc: JSONContent | undefined | null,
  ctx: DocxExportContext = createDocxExportContext()
): string {
  return narrativeToDocxXmlWithContext(doc, ctx).xml;
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

export function narrativeToDocxXmlWithContext(
  doc: JSONContent | undefined | null,
  ctx: DocxExportContext = createDocxExportContext()
): NarrativeDocxXmlResult {
  if (!doc || !doc.content?.length) {
    return { xml: wrapParagraph("Not Applicable"), ctx };
  }

  const sanitized = sanitizeDocTextNodes(doc);
  ctx.citationNumbers = citationNumbersFromDoc(sanitized);
  const parts: string[] = [];
  const portraitMax = portraitTableGridMax(ctx);
  const landscapeMax = ctx.pageSetup.landscapeContentWidthDxa;
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

  for (const node of sanitized.content ?? []) {
    if (node.type === "table") {
      const colCount = Math.max(1, getLogicalColumnCount(node.content ?? []));
      if (tableNeedsLandscapePage(colCount, portraitMax)) {
        openLandscape();
        parts.push(tableToXml(node, ctx, landscapeMax));
      } else {
        closeLandscape();
        parts.push(tableToXml(node, ctx, portraitMax));
      }
    } else {
      closeLandscape();
      if (node.type === "paragraph") {
        parts.push(paragraphToXml(node, false, null, null, false, ctx));
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        parts.push(listToXml(node, ctx));
      } else if (node.type === "heading") {
        parts.push(headingToXml(node, ctx));
      } else if (node.type === "mathBlock") {
        parts.push(mathBlockToXml(node));
      } else {
        parts.push(paragraphToXml(node, false, null, null, false, ctx));
      }
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

function textLineToCitationAwareRuns(
  line: string,
  rPr: string,
  textTag: "w:t" | "w:delText",
  superscriptRPr: string,
  citationNumbers: ReadonlySet<number> | undefined
): string {
  if (!line) return "";
  if (!citationNumbers || citationNumbers.size === 0) {
    return `<w:r>${rPr}<${textTag} xml:space="preserve">${escapeXml(line)}</${textTag}></w:r>`;
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
  ctx?: DocxExportContext
): string {
  const jc = paragraphJustification(align, ctx);
  const keep = keepNext ? "<w:keepNext/>" : "";
  const style =
    numId && ctx?.listParagraphStyle
      ? `<w:pStyle w:val="ListParagraph"/>`
      : "";
  const before = ctx?.paragraphSpacingBefore;
  const after = ctx?.paragraphSpacingAfter;
  const spacing =
    before || after
      ? `<w:spacing w:before="${before ?? "0"}" w:after="${after ?? "0"}"/>`
      : "";
  const num = numId
    ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`
    : "";
  return `<w:pPr>${style}${keep}${spacing}${jc}${num}</w:pPr>`;
}

function wrapParagraph(text: string, ctx?: DocxExportContext): string {
  return `<w:p>${paragraphProperties(null, null, false, ctx)}<w:r>${runProperties({}, ctx)}<w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p>`;
}

function headingStyleName(level: unknown): "Heading1" | "Heading2" | "Heading3" {
  const n = typeof level === "number" ? level : Number(level);
  if (n <= 1 || Number.isNaN(n)) return "Heading1";
  if (n >= 3) return "Heading3";
  return "Heading2";
}

function headingToXml(node: JSONContent, ctx: DocxExportContext): string {
  if (!ctx.useHeadingStyles) {
    return paragraphToXml(node, true, null, null, false, ctx);
  }
  const style = headingStyleName(node.attrs?.level);
  const runs = inlineNodesToRuns(node.content ?? [], false, ctx);
  const pPr = `<w:pPr><w:pStyle w:val="${style}"/>${paragraphJustification(null, ctx)}</w:pPr>`;
  if (!runs) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function paragraphToXml(
  node: JSONContent,
  bold = false,
  paragraphAlign?: string | null,
  numId?: number | null,
  keepNext = false,
  ctx?: DocxExportContext,
  runSizeOverride?: string
): string {
  const runs = inlineNodesToRuns(node.content ?? [], bold, ctx, runSizeOverride);
  const pPr = paragraphProperties(paragraphAlign, numId, keepNext, ctx);
  if (!runs) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function inlineNodesToRuns(
  nodes: JSONContent[],
  forceBold = false,
  ctx?: DocxExportContext,
  runSizeOverride?: string
): string {
  const parts: string[] = [];

  for (const child of nodes) {
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
        }
        if (lines[i]) {
          const textTag =
            revision?.type === suggestionDeleteMarkName ? "w:delText" : "w:t";
          runParts.push(
            textLineToCitationAwareRuns(
              lines[i]!,
              rPr,
              textTag,
              superscriptRPr,
              ctx?.citationNumbers
            )
          );
        }
      }
      const runXml = runParts.join("");
      parts.push(
        revision && runXml ? revisionWrapper(revision, runXml) : runXml
      );
    } else if (child.type === "hardBreak") {
      parts.push(`<w:r>${runProperties({ sizeHalfPoints: runSizeOverride }, ctx)}<w:br/></w:r>`);
    } else if (child.type === "imageInline" && ctx) {
      const src = child.attrs?.src as string | undefined;
      if (src) {
        const width = child.attrs?.width as number | undefined;
        parts.push(registerInlineImage(ctx, src, width));
      }
    } else if (child.type === "mathInline") {
      parts.push(mathInlineToRun(child, ctx));
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

function mathInlineToRun(node: JSONContent, ctx?: DocxExportContext): string {
  const omml = mathOmmlFromNode(node);
  if (!omml) return "";
  const inner = omml.startsWith("<m:oMath") ? omml : `<m:oMath>${omml}</m:oMath>`;
  return `<w:r>${runProperties({}, ctx)}${inner}</w:r>`;
}

function mathBlockToXml(node: JSONContent): string {
  const omml = mathOmmlFromNode(node);
  if (!omml) return wrapParagraph("[equation]");
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
  rPr += "</w:rPr>";
  return rPr;
}

function listToXml(node: JSONContent, ctx: DocxExportContext): string {
  const listType = node.type === "orderedList" ? "orderedList" : "bulletList";
  const numId = allocateListNumId(
    ctx,
    listType,
    (node.attrs?.listStyle as string | undefined) ?? null
  );
  const parts: string[] = [];
  for (const item of node.content ?? []) {
    if (item.type === "listItem") {
      let numbered = true;
      for (const child of item.content ?? []) {
        parts.push(
          paragraphToXml(
            child,
            false,
            null,
            numbered ? numId : null,
            false,
            ctx
          )
        );
        numbered = false;
      }
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

  // Nested inside the keep-together wrapper: explicit dxa width prevents Word
  // from honoring an oversized imported tblGrid sum and clipping the right edge.
  const tblPr = `<w:tblPr>
<w:tblStyle w:val="TableGrid"/>
${tblW}
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
  const keepNext = !isLastRow;
  const paragraphs = options.empty ? [] : cell.content ?? [];
  const cellAlign = isHeader
    ? (hAlign ?? ctx?.tableHeaderAlign ?? "left")
    : (hAlign ?? "left");
  const cellSize = ctx?.tableCellSizeHalfPoints ?? undefined;
  const content = paragraphs
    .map((p) => {
      if (p.type === "paragraph") {
        return paragraphToXml(p, isHeader, cellAlign, null, keepNext, ctx, cellSize);
      }
      return paragraphToXml(p, false, cellAlign, null, keepNext, ctx, cellSize);
    })
    .join("");

  // Word requires at least one paragraph in each cell
  const cellContent =
    content ||
    (keepNext
      ? `<w:p>${paragraphProperties(cellAlign, null, true, ctx)}</w:p>`
      : `<w:p>${paragraphProperties(cellAlign, null, false, ctx)}</w:p>`);
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
