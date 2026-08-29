import type { ListNumberingBases } from "@/lib/export/docx-numbering";
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
  pageSetup: DocxPageSetup;
  /** Numeric citation markers in the field currently being converted. */
  citationNumbers?: ReadonlySet<number>;
  /**
   * Emit Word Heading1–3 paragraph styles for TipTap heading nodes.
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

/** Register an inline image and return OOXML drawing markup for a w:r. */
export function registerInlineImage(
  ctx: DocxExportContext,
  dataUrl: string,
  widthPx?: number | null
): string {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return "";

  const ext = extensionForMime(parsed.mimeType);
  const fileName = `image${ctx.nextImageIndex}.${ext}`;
  ctx.nextImageIndex += 1;

  const relNum = ctx.nextRelNum;
  ctx.nextRelNum += 1;
  const relId = `rId${relNum}`;

  const dims = readRasterDimensions(parsed.bytes, parsed.mimeType);
  const intrinsicWidth = dims?.width ?? null;
  const intrinsicHeight = dims?.height ?? null;

  let width = widthPx ?? intrinsicWidth ?? 400;
  if (intrinsicWidth && width < MIN_INLINE_EXPORT_WIDTH_PX) {
    width = Math.min(intrinsicWidth, MAX_INLINE_EXPORT_WIDTH_PX);
  }
  width = Math.max(1, Math.min(width, MAX_INLINE_EXPORT_WIDTH_PX));

  const height =
    intrinsicWidth && intrinsicHeight
      ? Math.max(1, Math.round((width * intrinsicHeight) / intrinsicWidth))
      : Math.round(width * 0.75);

  const cx = Math.round(width * EMU_PER_PX);
  const cy = Math.round(height * EMU_PER_PX);

  ctx.media.push({
    relId,
    fileName,
    bytes: parsed.bytes,
    contentType: parsed.mimeType,
    widthPx: width,
    heightPx: height,
  });

  const docPrId = relNum;

  return (
    `<w:r>${runProperties(ctx)}` +
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="${escapeXml(fileName)}"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="${docPrId}" name="${escapeXml(fileName)}"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>` +
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
