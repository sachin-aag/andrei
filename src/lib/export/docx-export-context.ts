import {
  isEmptyImageDrawing,
  parseImageDrawing,
  type ImageDrawing,
} from "@/lib/drawings/overlay";
import type { ListNumberingBases } from "@/lib/export/docx-numbering";
import {
  annotatedAlternateContentXml,
  annotatedGroupInlineXml,
  overlayLayoutFromPhoto,
  pictureInlineXml,
} from "@/lib/export/docx-annotated-image";
import {
  DEFAULT_A4_PAGE_SETUP,
  type DocxPageSetup,
} from "@/lib/export/docx-page-setup";
import { readRasterDimensions } from "@/lib/export/raster-dimensions";

export type DocxMediaAsset = {
  relId: string;
  fileName: string;
  bytes: Buffer;
  contentType: string;
  widthPx: number;
  heightPx: number;
};

export type DocxCommentExportEntry = {
  docxId: number;
  appId: string;
  parentAppId: string | null;
  paraId: string;
  parentParaId: string | null;
  authorName: string;
  authorInitials: string;
  createdAt: Date;
  content: string;
};

const MIN_INLINE_EXPORT_WIDTH_PX = 96;
const MAX_INLINE_EXPORT_WIDTH_PX = 600;
const EMU_PER_PX = 9525;

export type InlineImageExportOptions = {
  drawing?: ImageDrawing | null;
  flattenedSrc?: string | null;
};

export type DocxParagraphAlign = "left" | "center" | "right" | "both";

export type DocxRunStyle = {
  font?: string;
  sizeHalfPoints?: string;
  forceBlackText?: boolean;
  tableHeaderFill?: string;
  paragraphAlign?: DocxParagraphAlign;
  paragraphSpacingBefore?: string;
  paragraphSpacingAfter?: string;
  listParagraphStyle?: boolean;
  tableKeepTogetherWrapper?: boolean;
  tableJustify?: "center";
  tableWidthPct?: string;
  tableGridMaxDxa?: number;
  tableCellSizeHalfPoints?: string;
  tableCellVAlign?: "center";
  tableHeaderAlign?: "center";
  tableBorderColor?: string;
  /** When false, body rows may split across pages (3xper source tables). Default true. */
  tableRowCantSplit?: boolean;
  /** Widow/orphan control on body paragraphs, not table cells. */
  widowControl?: boolean;
  /** Emit Word TableGrid cell margins (0 / 108 / 0 / 108 dxa). */
  tableCellMar?: boolean;
  /** Skip explicit tblBorders and let the TableGrid style draw hairlines. */
  tableUseStyleBorders?: boolean;
  paragraphLine?: string;
  paragraphLineRule?: "auto";
  bodyParagraphStyle?: string;
  inTableListParagraphStyle?: string;
  tableListIndentLeft?: string;
  tableListIndentHanging?: string;
  headingOutline?: "cvp";
  stripTableCaptions?: boolean;
  stripInTextCitationMarkers?: boolean;
  mergeEmptyFirstColumn?: boolean;
  tableCellKeepNext?: boolean;
  pageBreakBeforeHeading2?: boolean;
};

export type DocxExportContext = {
  media: DocxMediaAsset[];
  nextImageIndex: number;
  nextRelNum: number;
  numberingBases: ListNumberingBases;
  nextNumId: number;
  numberingPatches: string[];
  allocatedNumIds: number[];
  comments: DocxCommentExportEntry[];
  nextCommentId: number;
  runFont: string;
  runSizeHalfPoints: string;
  forceBlackText: boolean;
  tableHeaderFill: string;
  paragraphAlign: DocxParagraphAlign;
  paragraphSpacingBefore: string | null;
  paragraphSpacingAfter: string | null;
  listParagraphStyle: boolean;
  tableKeepTogetherWrapper: boolean;
  tableJustify: "center" | null;
  tableWidthPct: string | null;
  tableGridMaxDxa: number | null;
  tableCellSizeHalfPoints: string | null;
  tableCellVAlign: "center" | null;
  tableHeaderAlign: "center" | null;
  tableBorderColor: string | null;
  tableRowCantSplit: boolean;
  widowControl: boolean;
  tableCellMar: boolean;
  tableUseStyleBorders: boolean;
  paragraphLine: string | null;
  paragraphLineRule: "auto" | null;
  bodyParagraphStyle: string | null;
  inTableListParagraphStyle: string | null;
  tableListIndentLeft: string | null;
  tableListIndentHanging: string | null;
  headingOutline: "cvp" | null;
  stripTableCaptions: boolean;
  stripInTextCitationMarkers: boolean;
  mergeEmptyFirstColumn: boolean;
  tableCellKeepNext: boolean;
  pageBreakBeforeHeading2: boolean;
  pageSetup: DocxPageSetup;
  /** Numeric citation markers in the field currently being converted. */
  citationNumbers?: ReadonlySet<number>;
  /**
   * Emit Word Heading1–4 paragraph styles for TipTap heading nodes.
   * Investigation/DV keep headings as bold body paragraphs.
   */
  useHeadingStyles: boolean;
};

/** Matches 790-00134R Solea DV: Arial 10pt justified body, 9pt centered tables. */
export const CONVERGENT_DOCX_RUN_STYLE: DocxRunStyle = {
  font: "Arial",
  sizeHalfPoints: "20",
  forceBlackText: true,
  tableHeaderFill: "C6D9F1",
  paragraphAlign: "both",
  paragraphSpacingBefore: "60",
  paragraphSpacingAfter: "60",
  listParagraphStyle: true,
  tableKeepTogetherWrapper: false,
  tableJustify: "center",
  tableWidthPct: "5000",
  tableGridMaxDxa: 9346,
  tableCellSizeHalfPoints: "18",
  tableCellVAlign: "center",
  tableHeaderAlign: "center",
  tableBorderColor: "000000",
};

/**
 * Matches a real SOP/QA/017-F01 report: 12pt serif body, justified, with grey
 * table headers. The shared default fills table headers light blue (D9E2F3),
 * which is the most obvious giveaway that a document did not come from MJ.
 */
export const MJ_FIR_DOCX_RUN_STYLE: DocxRunStyle = {
  font: "Times New Roman",
  sizeHalfPoints: "24",
  forceBlackText: true,
  tableHeaderFill: "D9D9D9",
  paragraphAlign: "both",
  // Spacing intentionally omitted (-> null): source table rows are tight, and
  // paragraph spacing inside cells is what made our first render roughly twice
  // as tall per row.
  listParagraphStyle: true,
  tableKeepTogetherWrapper: false,
  // Fill the form cell. Without this, tables stop short of the right border and
  // leave a gutter the source report does not have.
  tableWidthPct: "5000",
  tableBorderColor: "000000",
};

/**
 * Compact 3xper narrative tables: center on the page, inherit TableGrid
 * hairlines/padding, and let rows split at a page break the way the source
 * protocols do. Citations styles override these so the appendix stays put.
 */
const THREE_XPER_NARRATIVE_TABLE_CHROME = {
  tableKeepTogetherWrapper: false,
  tableJustify: "center",
  tableRowCantSplit: false,
  widowControl: true,
  tableCellMar: true,
  tableUseStyleBorders: true,
} as const satisfies Partial<DocxRunStyle>;

/**
 * 3xper QAD/016/F06-00: Times New Roman 12pt, black text, gold table headers.
 * Used only for content the QSR slot renderer hands back to the generic
 * converter (lists, images, tables that do not fit the form grid).
 */
export const QSR_DOCX_RUN_STYLE: DocxRunStyle = {
  font: "Times New Roman",
  sizeHalfPoints: "24",
  forceBlackText: true,
  tableHeaderFill: "FFD966",
  paragraphAlign: "both",
  listParagraphStyle: true,
  tableWidthPct: "5000",
  ...THREE_XPER_NARRATIVE_TABLE_CHROME,
};

/**
 * 3xper QAD-SOP-PS-003-F08-00: Times New Roman 12pt, black text, yellow
 * header cells (source highlight, not grey TableGrid first-row fill).
 * Source protocol: Heading1 + numId 3, 1.5 body leading, TableParagraph bullets.
 */
export const CVP_DOCX_RUN_STYLE: DocxRunStyle = {
  font: "Times New Roman",
  sizeHalfPoints: "24",
  forceBlackText: true,
  tableHeaderFill: "FFFF00",
  paragraphAlign: "both",
  listParagraphStyle: false,
  tableCellVAlign: "center",
  tableHeaderAlign: "center",
  paragraphLine: "360",
  paragraphLineRule: "auto",
  bodyParagraphStyle: "BodyText",
  inTableListParagraphStyle: "TableParagraph",
  tableListIndentLeft: "429",
  tableListIndentHanging: "283",
  headingOutline: "cvp",
  stripTableCaptions: true,
  stripInTextCitationMarkers: true,
  mergeEmptyFirstColumn: true,
  tableCellKeepNext: false,
  pageBreakBeforeHeading2: true,
  ...THREE_XPER_NARRATIVE_TABLE_CHROME,
};

/**
 * 3xper QAD-SOP-MS-001-F04: Times New Roman 12pt for rich overflow tables
 * in VQ section bodies. Form grids are centered in export-xml separately.
 */
export const VQ_DOCX_RUN_STYLE: DocxRunStyle = {
  font: "Times New Roman",
  sizeHalfPoints: "24",
  forceBlackText: true,
  tableHeaderFill: "D9D9D9",
  paragraphAlign: "both",
  listParagraphStyle: true,
  ...THREE_XPER_NARRATIVE_TABLE_CHROME,
};

const EMPTY_NUMBERING_BASES: ListNumberingBases = {
  decimal: 0,
  disc: 0,
  dash: 0,
  maxNumId: 0,
};

const DEFAULT_RUN_FONT = "Times New Roman";
const DEFAULT_RUN_SIZE_HALF_POINTS = "24";
const DEFAULT_TABLE_HEADER_FILL = "D9E2F3";

export function createDocxExportContext(
  numberingBases: ListNumberingBases = EMPTY_NUMBERING_BASES,
  runStyle?: DocxRunStyle,
  options?: { useHeadingStyles?: boolean; pageSetup?: DocxPageSetup }
): DocxExportContext {
  return {
    media: [],
    nextImageIndex: 1,
    nextRelNum: 100,
    numberingBases,
    nextNumId: numberingBases.maxNumId + 1,
    numberingPatches: [],
    allocatedNumIds: [],
    comments: [],
    nextCommentId: 0,
    runFont: runStyle?.font ?? DEFAULT_RUN_FONT,
    runSizeHalfPoints: runStyle?.sizeHalfPoints ?? DEFAULT_RUN_SIZE_HALF_POINTS,
    forceBlackText: runStyle?.forceBlackText ?? false,
    tableHeaderFill: runStyle?.tableHeaderFill ?? DEFAULT_TABLE_HEADER_FILL,
    paragraphAlign: runStyle?.paragraphAlign ?? "left",
    paragraphSpacingBefore: runStyle?.paragraphSpacingBefore ?? null,
    paragraphSpacingAfter: runStyle?.paragraphSpacingAfter ?? null,
    listParagraphStyle: runStyle?.listParagraphStyle ?? false,
    tableKeepTogetherWrapper: runStyle?.tableKeepTogetherWrapper ?? true,
    tableJustify: runStyle?.tableJustify ?? null,
    tableWidthPct: runStyle?.tableWidthPct ?? null,
    tableGridMaxDxa: runStyle?.tableGridMaxDxa ?? null,
    tableCellSizeHalfPoints: runStyle?.tableCellSizeHalfPoints ?? null,
    tableCellVAlign: runStyle?.tableCellVAlign ?? null,
    tableHeaderAlign: runStyle?.tableHeaderAlign ?? null,
    tableBorderColor: runStyle?.tableBorderColor ?? null,
    tableRowCantSplit: runStyle?.tableRowCantSplit !== false,
    widowControl: runStyle?.widowControl === true,
    tableCellMar: runStyle?.tableCellMar === true,
    tableUseStyleBorders: runStyle?.tableUseStyleBorders === true,
    paragraphLine: runStyle?.paragraphLine ?? null,
    paragraphLineRule: runStyle?.paragraphLineRule ?? null,
    bodyParagraphStyle: runStyle?.bodyParagraphStyle ?? null,
    inTableListParagraphStyle: runStyle?.inTableListParagraphStyle ?? null,
    tableListIndentLeft: runStyle?.tableListIndentLeft ?? null,
    tableListIndentHanging: runStyle?.tableListIndentHanging ?? null,
    headingOutline: runStyle?.headingOutline ?? null,
    stripTableCaptions: runStyle?.stripTableCaptions === true,
    stripInTextCitationMarkers: runStyle?.stripInTextCitationMarkers === true,
    mergeEmptyFirstColumn: runStyle?.mergeEmptyFirstColumn === true,
    tableCellKeepNext: runStyle?.tableCellKeepNext !== false,
    pageBreakBeforeHeading2: runStyle?.pageBreakBeforeHeading2 === true,
    useHeadingStyles: options?.useHeadingStyles === true,
    pageSetup: options?.pageSetup ?? DEFAULT_A4_PAGE_SETUP,
  };
}

export function parseDataUrl(dataUrl: string): {
  mimeType: string;
  bytes: Buffer;
} | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return {
      mimeType: match[1]!.toLowerCase(),
      bytes: Buffer.from(match[2]!, "base64"),
    };
  } catch {
    return null;
  }
}

export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

type RegisteredImage = {
  relId: string;
  fileName: string;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  cx: number;
  cy: number;
  docPrId: number;
};

function displaySize(
  intrinsicWidth: number | null,
  intrinsicHeight: number | null,
  widthPx?: number | null
): { width: number; height: number; cx: number; cy: number } {
  let width = widthPx ?? intrinsicWidth ?? 400;
  if (intrinsicWidth && width < MIN_INLINE_EXPORT_WIDTH_PX) {
    width = Math.min(intrinsicWidth, MAX_INLINE_EXPORT_WIDTH_PX);
  }
  width = Math.max(1, Math.min(width, MAX_INLINE_EXPORT_WIDTH_PX));
  const height =
    intrinsicWidth && intrinsicHeight
      ? Math.max(1, Math.round((width * intrinsicHeight) / intrinsicWidth))
      : Math.round(width * 0.75);
  return {
    width,
    height,
    cx: Math.round(width * EMU_PER_PX),
    cy: Math.round(height * EMU_PER_PX),
  };
}

function pushImageMedia(
  ctx: DocxExportContext,
  dataUrl: string,
  displayWidthPx?: number | null
): RegisteredImage | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const ext = extensionForMime(parsed.mimeType);
  const fileName = `image${ctx.nextImageIndex}.${ext}`;
  ctx.nextImageIndex += 1;

  const relNum = ctx.nextRelNum;
  ctx.nextRelNum += 1;
  const relId = `rId${relNum}`;

  const dims = readRasterDimensions(parsed.bytes, parsed.mimeType);
  const intrinsicWidth = dims?.width ?? null;
  const intrinsicHeight = dims?.height ?? null;
  const size = displaySize(intrinsicWidth, intrinsicHeight, displayWidthPx);

  ctx.media.push({
    relId,
    fileName,
    bytes: parsed.bytes,
    contentType: parsed.mimeType,
    widthPx: size.width,
    heightPx: size.height,
  });

  return {
    relId,
    fileName,
    intrinsicWidth,
    intrinsicHeight,
    cx: size.cx,
    cy: size.cy,
    docPrId: relNum,
  };
}

/** Register an inline image and return OOXML drawing markup for a w:r. */
export function registerInlineImage(
  ctx: DocxExportContext,
  dataUrl: string,
  widthPx?: number | null,
  options?: InlineImageExportOptions
): string {
  const drawing = parseImageDrawing(options?.drawing);
  if (!drawing || isEmptyImageDrawing(drawing)) {
    const media = pushImageMedia(ctx, dataUrl, widthPx);
    if (!media) return "";
    return (
      `<w:r>${runProperties(ctx)}` +
      pictureInlineXml({
        relId: media.relId,
        fileName: media.fileName,
        cx: media.cx,
        cy: media.cy,
        docPrId: media.docPrId,
      }) +
      `</w:r>`
    );
  }

  const flattenedSrc =
    typeof options?.flattenedSrc === "string" && options.flattenedSrc.length > 0
      ? options.flattenedSrc
      : null;
  const fallback = pushImageMedia(ctx, flattenedSrc ?? dataUrl, widthPx);
  if (!fallback) return "";
  const original =
    flattenedSrc && flattenedSrc !== dataUrl
      ? pushImageMedia(ctx, dataUrl, widthPx)
      : fallback;
  if (!original) return "";

  const photoW = original.intrinsicWidth ?? 400;
  const photoH = original.intrinsicHeight ?? 300;
  const layout = overlayLayoutFromPhoto(
    photoW,
    photoH,
    drawing,
    fallback.cx,
    fallback.cy
  );

  return (
    `<w:r>${runProperties(ctx)}` +
    annotatedAlternateContentXml({
      choiceXml: annotatedGroupInlineXml({
        photoRelId: original.relId,
        photoFileName: original.fileName,
        drawing,
        layout,
        docPrId: fallback.docPrId,
        font: ctx.runFont,
      }),
      fallbackXml: pictureInlineXml({
        relId: fallback.relId,
        fileName: fallback.fileName,
        cx: fallback.cx,
        cy: fallback.cy,
        docPrId: fallback.docPrId + 50,
      }),
    }) +
    `</w:r>`
  );
}

function runProperties(ctx: DocxExportContext): string {
  const font = ctx.runFont;
  const size = ctx.runSizeHalfPoints;
  return (
    `<w:rPr>` +
    `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
    `</w:rPr>`
  );
}
