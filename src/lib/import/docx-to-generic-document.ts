import mammoth from "mammoth";
import PizZip from "pizzip";
import type { JSONContent } from "@tiptap/core";
import { enrichNarrativesFromDocxBuffer } from "@/lib/import/docx-rich-content";
import {
  parseHtmlInlineParagraph,
  parseHtmlTablesWithPositions,
} from "@/lib/import/html-table-parser";
import { emptyDoc } from "@/lib/tiptap/rich-text";

const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ENTRY_RATIO = 200;

export class GenericDocxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenericDocxImportError";
  }
}

export type GenericImportedDocument = {
  narrative: JSONContent;
  warnings: string[];
};

export async function docxBufferToGenericDocument(
  buffer: Buffer
): Promise<GenericImportedDocument> {
  const zip = inspectGenericDocxZip(buffer);
  const warnings = collectGenericImportWarnings(zip);

  const { value: html } = await mammoth.convertToHtml({ buffer });
  const narrative = htmlToGenericDoc(html);
  if (!narrative.content?.length) {
    narrative.content = emptyDoc().content;
  }

  await enrichNarrativesFromDocxBuffer(buffer, { body: { narrative } });

  return { narrative, warnings };
}

function inspectGenericDocxZip(buffer: Buffer): PizZip {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new GenericDocxImportError(
      "This file is not a readable Word document. Save as .docx (not encrypted) and try again."
    );
  }

  const names = Object.keys(zip.files);
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new GenericDocxImportError("This Word file is too large to import.");
  }
  if (names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) {
    throw new GenericDocxImportError(
      "This Word file contains macros. Save a copy without macros and try again."
    );
  }
  if (
    names.some((name) => /EncryptionInfo$/i.test(name)) ||
    names.some((name) => /EncryptedPackage$/i.test(name))
  ) {
    throw new GenericDocxImportError(
      "This Word file is password-protected. Remove the password and try again."
    );
  }

  let uncompressed = 0;
  for (const name of names) {
    const file = zip.files[name];
    if (!file || file.dir) continue;
    if (/\.(zip|docx)$/i.test(name)) {
      throw new GenericDocxImportError("This Word file is too large to import.");
    }
    const bytes = file.asNodeBuffer();
    uncompressed += bytes.byteLength;
    if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new GenericDocxImportError("This Word file is too large to import.");
    }
    const compressed = Math.max(1, (file as { _data?: { compressedSize?: number } })._data?.compressedSize ?? bytes.byteLength);
    if (bytes.byteLength / compressed > MAX_ENTRY_RATIO && bytes.byteLength > 1_000_000) {
      throw new GenericDocxImportError("This Word file is too large to import.");
    }
  }

  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) {
    throw new GenericDocxImportError(
      "This file is not a readable Word document. Save as .docx and try again."
    );
  }
  if (/<w:(?:ins|del|moveFrom|moveTo)\b/.test(documentXml)) {
    throw new GenericDocxImportError(
      "This Word file has unaccepted tracked changes. Accept or reject them in Word, then upload again."
    );
  }

  return zip;
}

function collectGenericImportWarnings(zip: PizZip): string[] {
  const warnings: string[] = [];
  const documentXml = zip.file("word/document.xml")?.asText() ?? "";
  const wordXml = Object.keys(zip.files)
    .filter((name) => name.startsWith("word/") && name.endsWith(".xml"))
    .map((name) => zip.file(name)?.asText() ?? "")
    .join("\n");

  if (
    wordXml.includes("drawingml/2006/diagram") ||
    /smartArt/i.test(wordXml)
  ) {
    warnings.push("SmartArt diagrams were omitted.");
  }
  if (/<w:txbxContent\b/.test(wordXml)) {
    warnings.push("Text boxes were omitted.");
  }
  if (/<wps:wsp\b/.test(wordXml) || /<wpg:wgp\b/.test(wordXml)) {
    warnings.push("Shapes and drawings were omitted.");
  }
  if (/<o:OLEObject\b/i.test(wordXml)) {
    warnings.push("Embedded objects were omitted.");
  }
  const footnotes = zip.file("word/footnotes.xml")?.asText() ?? "";
  if (/<w:footnote\b[^>]*w:id="[1-9]/.test(footnotes)) {
    warnings.push("Footnotes were omitted.");
  }
  if (/<w:sdt\b/.test(documentXml)) {
    warnings.push("Content controls were flattened or omitted.");
  }
  const headerHasText = ["word/header1.xml", "word/header2.xml", "word/header3.xml"]
    .some((name) => /<w:t[\s>]/.test(zip.file(name)?.asText() ?? ""));
  const footerHasText = ["word/footer1.xml", "word/footer2.xml"]
    .some((name) => /<w:t[\s>]/.test(zip.file(name)?.asText() ?? ""));
  if (headerHasText || footerHasText) {
    warnings.push(
      "Headers and footers were omitted. Export uses the Andrei document template header."
    );
  }

  return [...new Set(warnings)];
}

export function htmlToGenericDoc(html: string): JSONContent {
  const content: JSONContent[] = [];
  let i = 0;
  while (i < html.length) {
    const rest = html.slice(i);
    const next = rest.search(/<(h[1-3]|p|ul|ol|table)\b/i);
    if (next < 0) break;
    const abs = i + next;
    const el = findElementClose(html, abs);
    if (!el) {
      i = abs + 1;
      continue;
    }
    const inner = html.slice(el.openEnd, el.closeStart);
    switch (el.tag) {
      case "h1":
      case "h2":
      case "h3": {
        const para = parseParagraphWithImages(inner);
        content.push({
          type: "heading",
          attrs: { level: Number(el.tag.slice(1)) },
          content: para.content ?? [],
        });
        break;
      }
      case "p":
        content.push(parseParagraphWithImages(inner));
        break;
      case "ul":
        content.push(parseList(inner, "bulletList"));
        break;
      case "ol":
        content.push(parseList(inner, "orderedList"));
        break;
      case "table": {
        const fragment = html.slice(abs, el.closeEnd);
        const tables = parseHtmlTablesWithPositions(fragment, {
          includeLayoutTables: true,
        });
        if (tables[0]) content.push(tables[0].node);
        break;
      }
      default:
        break;
    }
    i = el.closeEnd;
  }
  return {
    type: "doc",
    content: content.length > 0 ? content : emptyDoc().content,
  };
}

function parseList(
  inner: string,
  type: "bulletList" | "orderedList"
): JSONContent {
  const items: JSONContent[] = [];
  let i = 0;
  while (i < inner.length) {
    const next = inner.slice(i).search(/<li\b/i);
    if (next < 0) break;
    const el = findElementClose(inner, i + next);
    if (!el) break;
    const liInner = inner.slice(el.openEnd, el.closeStart);
    const pMatch = /<p\b[^>]*>[\s\S]*$/i.exec(liInner);
    let para: JSONContent;
    if (pMatch) {
      const pEl = findElementClose(liInner, pMatch.index);
      para = parseParagraphWithImages(
        pEl ? liInner.slice(pEl.openEnd, pEl.closeStart) : liInner
      );
    } else {
      para = parseParagraphWithImages(liInner);
    }
    items.push({ type: "listItem", content: [para] });
    i = el.closeEnd;
  }
  return { type, content: items };
}

function parseParagraphWithImages(innerHtml: string): JSONContent {
  const parts: JSONContent[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(innerHtml)) !== null) {
    const before = innerHtml.slice(last, match.index);
    const parsed = parseHtmlInlineParagraph(before);
    if (parsed.content?.length) parts.push(...parsed.content);
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1];
    if (src?.startsWith("data:")) {
      parts.push({
        type: "imageInline",
        attrs: { src, alt: null, width: null },
      });
    }
    last = match.index + match[0].length;
  }
  const tail = parseHtmlInlineParagraph(innerHtml.slice(last));
  if (tail.content?.length) parts.push(...tail.content);
  return { type: "paragraph", content: parts };
}

function findElementClose(
  html: string,
  openStart: number
): {
  tag: string;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
} | null {
  const openMatch = /^<([a-z0-9]+)(\s[^>]*)?>/i.exec(html.slice(openStart));
  if (!openMatch) return null;
  const tag = openMatch[1]!.toLowerCase();
  const openEnd = openStart + openMatch[0].length;
  if (openMatch[0].endsWith("/>")) {
    return { tag, openEnd, closeStart: openEnd, closeEnd: openEnd };
  }
  const re = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
  re.lastIndex = openEnd;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const selfClosing = m[0].endsWith("/>");
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return {
          tag,
          openEnd,
          closeStart: m.index,
          closeEnd: m.index + m[0].length,
        };
      }
    } else if (!selfClosing) {
      depth += 1;
    }
  }
  return null;
}
