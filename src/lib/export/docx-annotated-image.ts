import {
  drawingExtent,
  flattenPixelPad,
  type DrawingShape,
  type ImageDrawing,
} from "@/lib/drawings/overlay";

export const EMU_PER_PX = 9525;

export type OverlayLayout = {
  groupCx: number;
  groupCy: number;
  photoOffX: number;
  photoOffY: number;
  photoCx: number;
  photoCy: number;
};

export function overlayLayoutFromPhoto(
  photoPxW: number,
  photoPxH: number,
  drawing: ImageDrawing,
  groupCx: number,
  groupCy: number
): OverlayLayout {
  const width = Math.max(1, photoPxW);
  const height = Math.max(1, photoPxH);
  const pad = flattenPixelPad(drawingExtent(drawing), width, height);
  const canvasW = Math.max(1, width + pad.left + pad.right);
  const canvasH = Math.max(1, height + pad.top + pad.bottom);
  return {
    groupCx,
    groupCy,
    photoOffX: Math.round((pad.left / canvasW) * groupCx),
    photoOffY: Math.round((pad.top / canvasH) * groupCy),
    photoCx: Math.round((width / canvasW) * groupCx),
    photoCy: Math.round((height / canvasH) * groupCy),
  };
}

function emuX(layout: OverlayLayout, x: number): number {
  return Math.round(layout.photoOffX + x * layout.photoCx);
}

function emuY(layout: OverlayLayout, y: number): number {
  return Math.round(layout.photoOffY + y * layout.photoCy);
}

function rgb(color: string): string {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  return "C62828";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineWidthEmu(layout: OverlayLayout): number {
  return Math.max(12700, Math.round(0.012 * Math.min(layout.photoCx, layout.photoCy)));
}

function arrowConnectorXml(
  shape: Extract<DrawingShape, { type: "arrow" }>,
  layout: OverlayLayout,
  lnW: number
): string {
  const x1 = emuX(layout, shape.x1);
  const y1 = emuY(layout, shape.y1);
  const x2 = emuX(layout, shape.x2);
  const y2 = emuY(layout, shape.y2);
  const offX = Math.min(x1, x2);
  const offY = Math.min(y1, y2);
  const cx = Math.max(1, Math.abs(x2 - x1));
  const cy = Math.max(1, Math.abs(y2 - y1));
  const flipH = x2 < x1 ? ' flipH="1"' : "";
  const flipV = y2 < y1 ? ' flipV="1"' : "";
  return (
    `<wps:wsp>` +
    `<wps:cNvCnPr><a:cNvCxnSpPr/></wps:cNvCnPr>` +
    `<wps:spPr>` +
    `<a:xfrm${flipH}${flipV}>` +
    `<a:off x="${offX}" y="${offY}"/>` +
    `<a:ext cx="${cx}" cy="${cy}"/>` +
    `</a:xfrm>` +
    `<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>` +
    `<a:ln w="${lnW}" cap="rnd">` +
    `<a:solidFill><a:srgbClr val="${rgb(shape.color)}"/></a:solidFill>` +
    `<a:tailEnd type="triangle" w="med" len="med"/>` +
    `</a:ln>` +
    `</wps:spPr>` +
    `<wps:bodyPr/>` +
    `</wps:wsp>`
  );
}

function labelBoxXml(
  shape: Extract<DrawingShape, { type: "label" }>,
  layout: OverlayLayout,
  font: string,
  lnW: number
): string {
  const x = emuX(layout, shape.x);
  const y = emuY(layout, shape.y);
  const cx = Math.max(1, Math.round(shape.w * layout.photoCx));
  const cy = Math.max(1, Math.round(shape.h * layout.photoCy));
  const heightPx = cy / EMU_PER_PX;
  const fontPx = Math.max(11, Math.min(18, heightPx * 0.38));
  const sz = Math.max(16, Math.round(fontPx * 1.5));
  const lines = (shape.text || " ").split(/\n/);
  const paragraphs = lines
    .map((line, index) => {
      const spacing =
        index === 0
          ? ""
          : `<w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>`;
      return (
        `<w:p>` +
        (index === 0
          ? `<w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>`
          : spacing) +
        `<w:r>` +
        `<w:rPr>` +
        `<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}"/>` +
        `<w:b/>` +
        `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
        `<w:color w:val="111111"/>` +
        `</w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(line)}</w:t>` +
        `</w:r>` +
        `</w:p>`
      );
    })
    .join("");
  return (
    `<wps:wsp>` +
    `<wps:cNvSpPr txBox="1"/>` +
    `<wps:spPr>` +
    `<a:xfrm>` +
    `<a:off x="${x}" y="${y}"/>` +
    `<a:ext cx="${cx}" cy="${cy}"/>` +
    `</a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="${Math.max(9525, Math.round(lnW * 0.7))}">` +
    `<a:solidFill><a:srgbClr val="${rgb(shape.color)}"/></a:solidFill>` +
    `</a:ln>` +
    `</wps:spPr>` +
    `<wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx>` +
    `<wps:bodyPr wrap="square" lIns="36000" tIns="18000" rIns="36000" bIns="18000" anchor="ctr"/>` +
    `</wps:wsp>`
  );
}

export function pictureInlineXml(args: {
  relId: string;
  fileName: string;
  cx: number;
  cy: number;
  docPrId: number;
}): string {
  const { relId, fileName, cx, cy, docPrId } = args;
  return (
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
    `</w:drawing>`
  );
}

function groupedPictureXml(args: {
  relId: string;
  fileName: string;
  layout: OverlayLayout;
  picId: number;
}): string {
  const { relId, fileName, layout, picId } = args;
  return (
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="${picId}" name="${escapeXml(fileName)}"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm>` +
    `<a:off x="${layout.photoOffX}" y="${layout.photoOffY}"/>` +
    `<a:ext cx="${layout.photoCx}" cy="${layout.photoCy}"/>` +
    `</a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>`
  );
}

/**
 * Word 2010+ drawing group: original photo plus native arrows/labels.
 * Double-click the group in Word to move a callout; Ungroup to fully edit.
 */
export function annotatedGroupInlineXml(args: {
  photoRelId: string;
  photoFileName: string;
  drawing: ImageDrawing;
  layout: OverlayLayout;
  docPrId: number;
  font: string;
}): string {
  const { photoRelId, photoFileName, drawing, layout, docPrId, font } = args;
  const lnW = lineWidthEmu(layout);
  const children = [
    groupedPictureXml({
      relId: photoRelId,
      fileName: photoFileName,
      layout,
      picId: docPrId + 1,
    }),
    ...drawing.shapes.map((shape) =>
      shape.type === "arrow"
        ? arrowConnectorXml(shape, layout, lnW)
        : labelBoxXml(shape, layout, font, lnW)
    ),
  ].join("");
  return (
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${layout.groupCx}" cy="${layout.groupCy}"/>` +
    `<wp:docPr id="${docPrId}" name="Figure annotation"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">` +
    `<wpg:wgp xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
    `<wpg:cNvGrpSpPr><a:cNvGrpSpPr/></wpg:cNvGrpSpPr>` +
    `<wpg:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="0" y="0"/>` +
    `<a:ext cx="${layout.groupCx}" cy="${layout.groupCy}"/>` +
    `<a:chOff x="0" y="0"/>` +
    `<a:chExt cx="${layout.groupCx}" cy="${layout.groupCy}"/>` +
    `</a:xfrm>` +
    `</wpg:grpSpPr>` +
    children +
    `</wpg:wgp>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`
  );
}

export function annotatedAlternateContentXml(args: {
  choiceXml: string;
  fallbackXml: string;
}): string {
  return (
    `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">` +
    `<mc:Choice Requires="wpg">${args.choiceXml}</mc:Choice>` +
    `<mc:Fallback>${args.fallbackXml}</mc:Fallback>` +
    `</mc:AlternateContent>`
  );
}
