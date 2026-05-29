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

import type { ListNumberingBases } from "@/lib/export/docx-numbering";

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
};

const EMPTY_NUMBERING_BASES: ListNumberingBases = {
  decimal: 0,
  disc: 0,
  dash: 0,
  maxNumId: 0,
};

export function createDocxExportContext(
  numberingBases: ListNumberingBases = EMPTY_NUMBERING_BASES
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

  const width = Math.max(1, widthPx ?? 400);
  const height = Math.round(width * 0.75);

  // EMUs: 914400 per inch; assume 96 DPI → width px * 9525
  const cx = Math.round(width * 9525);
  const cy = Math.round(height * 9525);

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
    `<w:r>${runProperties()}` +
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

function runProperties(): string {
  return (
    `<w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>` +
    `<w:sz w:val="24"/><w:szCs w:val="24"/>` +
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
