import PizZip from "pizzip";
import type { DocxExportContext } from "@/lib/export/docx-export-context";

const RELS_PATH = "word/_rels/document.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Inject exported inline images into a rendered docx zip. */
export function applyInlineMediaToDocxZip(
  zip: PizZip,
  ctx: DocxExportContext
): void {
  if (ctx.media.length === 0) return;

  for (const asset of ctx.media) {
    zip.file(`word/media/${asset.fileName}`, asset.bytes);
  }

  const relsFile = zip.file(RELS_PATH);
  if (!relsFile) return;
  let relsXml = relsFile.asText();
  for (const asset of ctx.media) {
    const rel = `<Relationship Id="${asset.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${asset.fileName}"/>`;
    relsXml = relsXml.replace("</Relationships>", `${rel}</Relationships>`);
  }
  zip.file(RELS_PATH, relsXml);

  let ctXml = zip.file(CONTENT_TYPES_PATH)?.asText() ?? "";
  for (const asset of ctx.media) {
    const ext = asset.fileName.split(".").pop() ?? "png";
    const partName = `/word/media/${asset.fileName}`;
    if (ctXml.includes(`PartName="${partName}"`)) continue;
    const defaultExt = ext === "jpeg" ? "jpeg" : ext;
    const contentType = asset.contentType;
    const override =
      `<Override PartName="${partName}" ContentType="${escapeXmlAttr(contentType)}"/>`;
    if (!ctXml.includes(`Extension="${defaultExt}"`)) {
      ctXml = ctXml.replace(
        "</Types>",
        `<Default Extension="${defaultExt}" ContentType="${escapeXmlAttr(contentType)}"/>${override}</Types>`
      );
    } else {
      ctXml = ctXml.replace("</Types>", `${override}</Types>`);
    }
  }
  if (ctXml) zip.file(CONTENT_TYPES_PATH, ctXml);
}
