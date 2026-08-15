import PizZip from "pizzip";

/** Caps keep vision cost bounded for large evidence packs. */
export const DEFAULT_MAX_DOCX_IMAGES = 40;
export const DEFAULT_MAX_DOCX_IMAGE_BYTES = 8_000_000;
export const DOCX_IMAGE_NEARBY_CHARS = 280;
export const DOCX_MAX_VISUAL_CHARS = 1_500;

const VISION_SAFE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type DocxEmbeddedImage = {
  ordinal: number;
  bytes: Buffer;
  mediaType: string;
  filename: string;
  /** Cumulative plain-text length before this image in OOXML body order. */
  charOffset: number;
  /** Nearby paragraph text for placement / model context. */
  nearbyText: string;
  altText: string | null;
};

export type ExtractDocxImagesOptions = {
  maxImages?: number;
  maxBytesPerImage?: number;
};

type MediaAsset = {
  bytes: Buffer;
  mediaType: string;
  filename: string;
};

/**
 * Pull raster images from a .docx in document order, with rough char offsets
 * for mapping onto mammoth pseudo-pages. Scans the body plus headers/footers.
 * Skips WMF/EMF and other non-vision formats. Failures return an empty list
 * (ingest should still index text).
 */
export function extractDocxEmbeddedImages(
  buffer: Buffer,
  options: ExtractDocxImagesOptions = {}
): { images: DocxEmbeddedImage[]; totalXmlChars: number } {
  const maxImages = options.maxImages ?? DEFAULT_MAX_DOCX_IMAGES;
  const maxBytesPerImage =
    options.maxBytesPerImage ?? DEFAULT_MAX_DOCX_IMAGE_BYTES;

  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.file("word/document.xml")?.asText();
    if (!documentXml) return { images: [], totalXmlChars: 0 };

    const images: DocxEmbeddedImage[] = [];
    const documentRelsXml =
      zip.file("word/_rels/document.xml.rels")?.asText() ?? "";

    // Headers/footers first at offset 0 so letterhead figures land on page 1.
    for (const headerTarget of listRelatedParts(
      documentRelsXml,
      /relationships\/(header|footer)$/i
    )) {
      if (images.length >= maxImages) break;
      appendImagesFromPart({
        zip,
        partPath: resolveWordPartPath(headerTarget),
        images,
        maxImages,
        maxBytesPerImage,
        charOffset: 0,
        nearbyFallback: "Document header/footer",
      });
    }

    const bodyMatch = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/i.exec(documentXml);
    const bodyInner = bodyMatch?.[1] ?? documentXml;
    const bodyResult = appendImagesFromPart({
      zip,
      partPath: "word/document.xml",
      partXml: bodyInner,
      relsXml: documentRelsXml,
      images,
      maxImages,
      maxBytesPerImage,
      charOffset: 0,
    });

    return {
      images,
      totalXmlChars: Math.max(bodyResult.charOffset, 1),
    };
  } catch {
    return { images: [], totalXmlChars: 0 };
  }
}

function appendImagesFromPart(input: {
  zip: PizZip;
  partPath: string;
  partXml?: string;
  relsXml?: string;
  images: DocxEmbeddedImage[];
  maxImages: number;
  maxBytesPerImage: number;
  charOffset: number;
  nearbyFallback?: string;
}): { charOffset: number } {
  const partXml =
    input.partXml ?? input.zip.file(input.partPath)?.asText() ?? "";
  if (!partXml) return { charOffset: input.charOffset };

  const relsXml =
    input.relsXml ??
    input.zip.file(relsPathForPart(input.partPath))?.asText() ??
    "";
  const media = readMediaAssetsFromRels(
    input.zip,
    relsXml,
    input.maxBytesPerImage
  );
  if (media.size === 0) return { charOffset: input.charOffset };

  const paragraphs = splitParagraphs(partXml);
  let charOffset = input.charOffset;
  let previousText = "";

  for (const paragraphXml of paragraphs) {
    if (input.images.length >= input.maxImages) break;

    const { text, embeds, altTexts } = parseParagraphMedia(paragraphXml);
    const trimmed = text.replace(/\s+/g, " ").trim();

    for (let i = 0; i < embeds.length; i += 1) {
      if (input.images.length >= input.maxImages) break;
      const relId = embeds[i]!;
      const asset = media.get(relId);
      if (!asset) continue;
      if (!VISION_SAFE_MEDIA_TYPES.has(asset.mediaType)) continue;

      const nearbyText = truncateNearby(
        [previousText, trimmed, input.nearbyFallback]
          .filter(Boolean)
          .join(" ")
      );
      input.images.push({
        ordinal: input.images.length + 1,
        bytes: asset.bytes,
        mediaType: asset.mediaType,
        filename: asset.filename,
        charOffset,
        nearbyText,
        altText: altTexts[i] ?? null,
      });
    }

    if (trimmed) {
      charOffset += trimmed.length + 1;
      previousText = trimmed;
    }
  }

  return { charOffset };
}

function listRelatedParts(relsXml: string, typePattern: RegExp): string[] {
  const targets: string[] = [];
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0]!;
    const type = /\bType="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (!type || !target) continue;
    if (typePattern.test(type) && !targets.includes(target)) {
      targets.push(target);
    }
  }
  return targets;
}

function resolveWordPartPath(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("word/")) return target;
  return `word/${target}`;
}

function relsPathForPart(partPath: string): string {
  const normalized = partPath.replace(/^\//, "");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  const file = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  return dir ? `${dir}/_rels/${file}.rels` : `_rels/${file}.rels`;
}

function readMediaAssetsFromRels(
  zip: PizZip,
  relsXml: string,
  maxBytesPerImage: number
): Map<string, MediaAsset> {
  const out = new Map<string, MediaAsset>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0]!;
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    addMediaRelationship(zip, out, id, target, maxBytesPerImage);
  }
  return out;
}

function addMediaRelationship(
  zip: PizZip,
  out: Map<string, MediaAsset>,
  id: string,
  target: string,
  maxBytesPerImage: number
): void {
  if (out.has(id)) return;
  if (!/(^|\/)media\//i.test(target)) return;

  const partPath = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("media/")
      ? `word/${target}`
      : target.includes("word/")
        ? target
        : `word/${target}`;
  const file = zip.file(partPath);
  if (!file) return;
  const bytes = file.asNodeBuffer();
  if (bytes.length === 0 || bytes.length > maxBytesPerImage) return;

  const filename = partPath.split("/").pop() ?? partPath;
  const mediaType = mediaTypeFromFilename(filename);
  if (!mediaType) return;
  out.set(id, { bytes, mediaType, filename });
}

/**
 * Map OOXML-ordered images onto mammoth pseudo-pages by proportional
 * character progress (close enough — not layout-perfect).
 */
export function assignDocxImagesToPages(
  pages: Array<{ pageNumber: number; text: string }>,
  images: DocxEmbeddedImage[],
  totalXmlChars: number
): Map<number, DocxEmbeddedImage[]> {
  const byPage = new Map<number, DocxEmbeddedImage[]>();
  if (pages.length === 0 || images.length === 0) return byPage;

  const pageEnds: number[] = [];
  let cumulative = 0;
  for (const page of pages) {
    cumulative += page.text.length;
    pageEnds.push(cumulative);
  }
  const mammothTotal = Math.max(cumulative, 1);
  const xmlTotal = Math.max(totalXmlChars, 1);

  for (const image of images) {
    const mammothPos = (image.charOffset / xmlTotal) * mammothTotal;
    let pageNumber = pages[pages.length - 1]!.pageNumber;
    for (let i = 0; i < pageEnds.length; i += 1) {
      if (mammothPos <= pageEnds[i]!) {
        pageNumber = pages[i]!.pageNumber;
        break;
      }
    }
    const list = byPage.get(pageNumber) ?? [];
    list.push(image);
    byPage.set(pageNumber, list);
  }

  return byPage;
}

/** Join figure descriptions for a page's `visualInterpretation` field. */
export function formatDocxPageVisualInterpretation(
  entries: Array<{ ordinal: number; description: string }>
): string {
  const lines = entries
    .map((entry) => {
      const description = entry.description.trim();
      if (!description) return "";
      return `Figure ${entry.ordinal}: ${description}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return truncate(lines.join("\n\n"), DOCX_MAX_VISUAL_CHARS);
}

function mediaTypeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "wmf":
    case "emf":
      return null;
    default:
      return null;
  }
}

function parseParagraphMedia(paragraphXml: string): {
  text: string;
  embeds: string[];
  altTexts: Array<string | null>;
} {
  const embeds: string[] = [];
  const altTexts: Array<string | null> = [];
  const textParts: string[] = [];

  const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  for (const runMatch of paragraphXml.matchAll(runRe)) {
    const runXml = runMatch[0]!;
    if (
      runXml.includes("<w:drawing") ||
      runXml.includes("<w:pict") ||
      runXml.includes("<v:imagedata")
    ) {
      const embed = extractImageRelationshipId(runXml);
      if (embed) {
        embeds.push(embed);
        altTexts.push(extractAltText(runXml));
      }
    }
    for (const textMatch of runXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
      textParts.push(decodeXmlEntities(textMatch[1] ?? ""));
    }
  }

  // Floating drawings sometimes sit outside runs.
  if (embeds.length === 0) {
    for (const blip of paragraphXml.matchAll(
      /<a:blip\b[^>]*\br:embed="([^"]+)"/g
    )) {
      embeds.push(blip[1]!);
      altTexts.push(null);
    }
    for (const vml of paragraphXml.matchAll(
      /<v:imagedata\b[^>]*\br:id="([^"]+)"/g
    )) {
      embeds.push(vml[1]!);
      altTexts.push(null);
    }
  }

  return { text: textParts.join(""), embeds, altTexts };
}

function extractImageRelationshipId(runXml: string): string | null {
  const vml = /<v:imagedata\b[^>]*\br:id="([^"]+)"/.exec(runXml);
  if (vml?.[1]) return vml[1];
  const drawing = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(runXml);
  return drawing?.[1] ?? null;
}

function extractAltText(runXml: string): string | null {
  const descr = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/.exec(runXml);
  if (descr?.[1]?.trim()) return decodeXmlEntities(descr[1].trim());
  const title = /<wp:docPr\b[^>]*\btitle="([^"]*)"/.exec(runXml);
  if (title?.[1]?.trim()) return decodeXmlEntities(title[1].trim());
  return null;
}

function splitParagraphs(bodyInner: string): string[] {
  const paras: string[] = [];
  let pos = 0;
  const findParagraphOpen = (from: number) => {
    const re = /<w:p(?:\s|>)/g;
    re.lastIndex = from;
    return re.exec(bodyInner)?.index ?? -1;
  };
  while (pos < bodyInner.length) {
    const start = findParagraphOpen(pos);
    if (start < 0) break;
    const gt = bodyInner.indexOf(">", start);
    if (gt < 0) break;
    let depth = 1;
    let i = gt + 1;
    while (i < bodyInner.length && depth > 0) {
      const nextOpen = findParagraphOpen(i);
      const nextClose = bodyInner.indexOf("</w:p>", i);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        if (depth === 0) {
          paras.push(bodyInner.slice(start, nextClose + "</w:p>".length));
          pos = nextClose + "</w:p>".length;
          break;
        }
        i = nextClose + "</w:p>".length;
      }
    }
    if (depth > 0) break;
  }
  return paras;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function truncateNearby(text: string): string {
  return truncate(text.replace(/\s+/g, " ").trim(), DOCX_IMAGE_NEARBY_CHARS);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}...`;
}
