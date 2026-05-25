import PizZip from "pizzip";
import type { JSONContent } from "@tiptap/core";
import { ommlFragmentToMathml } from "@/lib/math/omml-mathml";
import { extractMathFromImage } from "@/lib/import/extract-math-from-image";
import { wordColorValToCss } from "@/lib/tiptap/text-color";

type InlinePart =
  | {
      kind: "text";
      text: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      subscript?: boolean;
      superscript?: boolean;
    }
  | { kind: "break" }
  | { kind: "image"; dataUrl: string; mime: string; width?: number }
  | {
      kind: "mathInline";
      omml: string | null;
      mathml: string;
      ommlDirty: boolean;
      latex?: string;
    }
  | {
      kind: "mathBlock";
      omml: string | null;
      mathml: string;
      ommlDirty: boolean;
      latex?: string;
    };

type ParsedParagraph = {
  plainText: string;
  parts: InlinePart[];
  isMathBlock: boolean;
};

function readDocumentXml(buffer: Buffer): string | null {
  try {
    const zip = new PizZip(buffer);
    return zip.file("word/document.xml")?.asText() ?? null;
  } catch {
    return null;
  }
}

type MediaAsset = { dataUrl: string; mime: string };

function readMediaFromBuffer(buffer: Buffer): Map<string, MediaAsset> {
  const out = new Map<string, MediaAsset>();
  try {
    const zip = new PizZip(buffer);
    const rels = zip.file("word/_rels/document.xml.rels")?.asText() ?? "";
    const relMap = new Map<string, string>();
    for (const m of rels.matchAll(
      /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g
    )) {
      relMap.set(m[1]!, m[2]!);
    }
    for (const [id, target] of relMap) {
      if (!target.startsWith("media/")) continue;
      const file = zip.file(`word/${target}`);
      if (!file) continue;
      const bytes = file.asNodeBuffer();
      const ext = target.split(".").pop()?.toLowerCase() ?? "png";
      const mime =
        ext === "jpeg" || ext === "jpg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : ext === "wmf"
                ? "image/x-wmf"
                : ext === "emf"
                  ? "image/x-emf"
                  : "image/png";
      out.set(id, { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, mime });
    }
  } catch {
    /* ignore */
  }
  return out;
}

function isWmfMimeString(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === "image/x-wmf" || m === "image/wmf" || m === "image/x-emf" || m === "image/emf";
}

function dataUrlToBytes(src: string): Uint8Array {
  const comma = src.indexOf(",");
  const base64 = comma >= 0 ? src.slice(comma + 1) : src;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function extractRunText(runXml: string): string {
  const parts: string[] = [];
  for (const m of runXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
    parts.push(
      m[1]!
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    );
  }
  return parts.join("");
}

function runVertAlign(runXml: string): "subscript" | "superscript" | null {
  const m = /<w:vertAlign w:val="(subscript|superscript)"/.exec(runXml);
  return m ? (m[1] as "subscript" | "superscript") : null;
}

function runHasOnOffProperty(runXml: string, tag: "b" | "i"): boolean {
  const m = new RegExp(`<w:${tag}(?:\\s[^>]*)?\\/>`).exec(runXml);
  if (!m) return false;
  const valMatch = /w:val="([^"]+)"/.exec(m[0]!);
  if (!valMatch) return true;
  const val = valMatch[1]!.toLowerCase();
  return val !== "false" && val !== "0";
}

function runIsUnderline(runXml: string): boolean {
  const m = /<w:u(?:\s[^>]*)?\/>/.exec(runXml);
  if (!m) return false;
  const valMatch = /w:val="([^"]+)"/.exec(m[0]!);
  if (!valMatch) return true;
  const val = valMatch[1]!.toLowerCase();
  return val !== "none" && val !== "false" && val !== "0";
}

function runTextColor(runXml: string): string | undefined {
  const m = /<w:color w:val="([^"]+)"/.exec(runXml);
  if (!m) return undefined;
  return wordColorValToCss(m[1]);
}

function extractImageRelationshipId(runXml: string): string | null {
  const vml = /<v:imagedata\b[^>]*\br:id="([^"]+)"/.exec(runXml);
  if (vml?.[1]) return vml[1];

  const drawing = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(runXml);
  return drawing?.[1] ?? null;
}

function extractExtentCx(runXml: string): number | undefined {
  const m = /<wp:extent cx="(\d+)"/.exec(runXml);
  if (!m) return undefined;
  const cx = Number(m[1]);
  if (!Number.isFinite(cx)) return undefined;
  return Math.max(1, Math.round(cx / 9525));
}

function extractStyleWidth(runXml: string): number | undefined {
  const m = /\bstyle="[^"]*\bwidth:([0-9.]+)(pt|px)/i.exec(runXml);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.round(m[2]?.toLowerCase() === "pt" ? (value * 96) / 72 : value));
}

function extractOmmlFromRun(runXml: string): string | null {
  const start = runXml.indexOf("<m:oMath");
  if (start < 0) return null;
  const end = runXml.indexOf("</m:oMath>", start);
  if (end < 0) return null;
  return runXml.slice(start, end + "</m:oMath>".length);
}

function parseParagraphXml(pXml: string, media: Map<string, MediaAsset>): ParsedParagraph {
  const parts: InlinePart[] = [];
  let plain = "";

  const oMathPara = /<m:oMathPara[\s\S]*?<\/m:oMathPara>/.exec(pXml);
  if (oMathPara) {
    const ommlMatch = /<m:oMath[\s\S]*?<\/m:oMath>/.exec(oMathPara[0]!);
    const omml = ommlMatch?.[0] ?? "";
    const mathml = omml ? ommlFragmentToMathml(omml) : "";
    parts.push({ kind: "mathBlock", omml, mathml, ommlDirty: false });
    return { plainText: "[equation]", parts, isMathBlock: true };
  }

  const runRe = /<w:r[\s\S]*?<\/w:r>/g;
  for (const runMatch of pXml.matchAll(runRe)) {
    const runXml = runMatch[0]!;
    if (/<w:br\s*\/>/.test(runXml) && !/<w:t/.test(runXml)) {
      parts.push({ kind: "break" });
      plain += "\n";
      continue;
    }

    const omml = extractOmmlFromRun(runXml);
    if (omml) {
      const mathml = ommlFragmentToMathml(omml);
      parts.push({ kind: "mathInline", omml, mathml, ommlDirty: false });
      plain += "[equation]";
      continue;
    }

    if (
      runXml.includes("<w:drawing") ||
      runXml.includes("<w:pict") ||
      runXml.includes("<v:imagedata")
    ) {
      const embed = extractImageRelationshipId(runXml);
      const asset = embed ? media.get(embed) : undefined;
      if (asset) {
        parts.push({
          kind: "image",
          dataUrl: asset.dataUrl,
          mime: asset.mime,
          width: extractExtentCx(runXml) ?? extractStyleWidth(runXml),
        });
        plain += "[image]";
        continue;
      }
    }

    const text = extractRunText(runXml);
    if (!text) continue;
    const align = runVertAlign(runXml);
    const color = runTextColor(runXml);
    parts.push({
      kind: "text",
      text,
      bold: runHasOnOffProperty(runXml, "b"),
      italic: runHasOnOffProperty(runXml, "i"),
      underline: runIsUnderline(runXml),
      ...(color ? { color } : {}),
      subscript: align === "subscript",
      superscript: align === "superscript",
    });
    plain += text;
  }

  return { plainText: plain, parts, isMathBlock: false };
}

function splitTopLevelParagraphs(bodyInner: string): string[] {
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
        depth++;
        i = nextOpen + 4;
      } else {
        depth--;
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

function partsToParagraphContent(parts: InlinePart[]): JSONContent[] {
  const content: JSONContent[] = [];
  for (const part of parts) {
    if (part.kind === "text") {
      const marks: JSONContent["marks"] = [];
      if (part.bold) marks.push({ type: "bold" });
      if (part.italic) marks.push({ type: "italic" });
      if (part.underline) marks.push({ type: "underline" });
      if (part.color) marks.push({ type: "textStyle", attrs: { color: part.color } });
      if (part.subscript) marks.push({ type: "subscript" });
      if (part.superscript) marks.push({ type: "superscript" });
      content.push({
        type: "text",
        text: part.text,
        ...(marks.length ? { marks } : {}),
      });
    } else if (part.kind === "break") {
      content.push({ type: "hardBreak" });
    } else if (part.kind === "image") {
      content.push({
        type: "imageInline",
        attrs: {
          src: part.dataUrl,
          alt: null,
          width: part.width ?? null,
        },
      });
    } else if (part.kind === "mathInline") {
      content.push({
        type: "mathInline",
        attrs: {
          mathml: part.mathml,
          omml: part.omml,
          ommlDirty: part.ommlDirty,
          ...(part.latex ? { latex: part.latex } : {}),
        },
      });
    }
  }
  return content;
}

function normalizePlain(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeMediaPlaceholders(s: string): string {
  return s
    .replace(/\[image(?::[^\]]*)?\]/gi, "[media]")
    .replace(/\[equation\]/gi, "[media]");
}

const MIN_INCLUSION_MATCH_LEN = 12;

function plainTextMatches(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;

  const candidateMedia = normalizeMediaPlaceholders(candidate);
  const expectedMedia = normalizeMediaPlaceholders(expected);

  if (candidateMedia === expectedMedia) return true;

  // Only allow substring inclusion when BOTH sides are substantial; otherwise
  // a stray short OOXML run (e.g. "2") would falsely match any long narrative
  // paragraph that happens to contain that digit and overwrite it.
  const minLen = Math.min(candidateMedia.length, expectedMedia.length);
  if (minLen < MIN_INCLUSION_MATCH_LEN) return false;

  return (
    candidateMedia.includes(expectedMedia) ||
    expectedMedia.includes(candidateMedia)
  );
}

function paragraphPlainText(node: JSONContent): string {
  const chunks: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text") chunks.push(n.text ?? "");
    if (n.type === "hardBreak") chunks.push("\n");
    if (n.type === "imageInline") chunks.push("[image]");
    if (n.type === "mathInline") chunks.push("[equation]");
    for (const ch of n.content ?? []) walk(ch);
  };
  for (const ch of node.content ?? []) walk(ch);
  return chunks.join("");
}

function applyPartsToParagraph(node: JSONContent, parts: InlinePart[]): boolean {
  if (parts.length === 0) return false;
  node.content = partsToParagraphContent(parts);
  return true;
}

function replaceParagraphWithMathBlock(
  doc: JSONContent,
  index: number,
  part: Extract<InlinePart, { kind: "mathBlock" }>
): void {
  if (!doc.content) return;
  doc.content[index] = {
    type: "mathBlock",
    attrs: {
      mathml: part.mathml,
      omml: part.omml,
      ommlDirty: part.ommlDirty,
      ...(part.latex ? { latex: part.latex } : {}),
    },
  };
}

/**
 * Walk the parsed paragraphs, find image parts that are legacy WMF/EMF formula
 * previews (Equation Editor / OLE), and replace them with `mathInline` parts
 * by sending the image to a vision LLM. Falls back to a `[formula]` text
 * placeholder when extraction fails — the original WMF data URL is dropped so
 * downstream code (and the export pipeline) never sees an unsupported MIME.
 */
async function resolveLegacyMathImages(parsed: ParsedParagraph[]): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const paragraph of parsed) {
    for (let i = 0; i < paragraph.parts.length; i++) {
      const part = paragraph.parts[i]!;
      if (part.kind !== "image") continue;
      if (!isWmfMimeString(part.mime)) continue;

      const idx = i;
      const contextHint = paragraph.plainText.replace(/\[image\]/g, "").trim().slice(0, 240);
      tasks.push(
        (async () => {
          let result: Awaited<ReturnType<typeof extractMathFromImage>> = null;
          try {
            result = await extractMathFromImage({
              bytes: dataUrlToBytes(part.dataUrl),
              mime: part.mime,
              contextHint: contextHint || undefined,
              displayWidth: part.width,
            });
          } catch (err) {
            console.error("[docx-import] math extraction threw:", err);
          }

          if (result) {
            paragraph.parts[idx] = {
              kind: "mathInline",
              mathml: result.mathml,
              omml: null,
              ommlDirty: true,
              latex: result.latex,
            };
          } else {
            paragraph.parts[idx] = { kind: "text", text: "[formula]" };
          }
        })()
      );
    }
  }
  if (tasks.length) await Promise.all(tasks);
}

function findParsedParagraphMatch(
  expected: string,
  parsed: ParsedParagraph[],
  usedParsed: Set<number>,
  pIdx: number
): { matched: ParsedParagraph; index: number } | null {
  const expectedHasMedia = normalizeMediaPlaceholders(expected).includes("[media]");

  const tryRange = (start: number, end: number) => {
    for (let scan = start; scan < end; scan++) {
      if (usedParsed.has(scan)) continue;
      const candidate = parsed[scan]!;
      const candidatePlain = normalizePlain(candidate.plainText);
      if (!candidatePlain && !expected) {
        return { matched: candidate, index: scan };
      }
      if (plainTextMatches(candidatePlain, expected)) {
        return { matched: candidate, index: scan };
      }
    }
    return null;
  };

  if (expectedHasMedia) {
    return tryRange(0, parsed.length);
  }

  // Prefer a forward window first, then search the whole document. Table
  // injection removes flat narrative paragraphs while OOXML indices stay
  // body-ordered, so sequential pIdx alone desyncs after tables are inserted.
  return (
    tryRange(pIdx, Math.min(parsed.length, pIdx + 20)) ?? tryRange(0, parsed.length)
  );
}

/**
 * Enrich imported TipTap narratives with sub/superscript, images, and equations
 * parsed directly from OOXML (mammoth markdown drops these).
 *
 * Legacy WMF/EMF formula previews (Equation Editor / OLE) are sent through a
 * vision LLM and converted to editable `mathInline` nodes — see
 * `extractMathFromImage`.
 */
export async function enrichNarrativesFromDocxBuffer(
  buffer: Buffer,
  sections: {
    define?: { narrative?: JSONContent };
    measure?: { narrative?: JSONContent };
    improve?: { narrative?: JSONContent };
  }
): Promise<void> {
  const xml = readDocumentXml(buffer);
  if (!xml) return;

  const media = readMediaFromBuffer(buffer);
  const bodyMatch = /<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(xml);
  if (!bodyMatch) return;

  const paragraphs = splitTopLevelParagraphs(bodyMatch[1]!);
  const parsed = paragraphs.map((p) => parseParagraphXml(p, media));

  await resolveLegacyMathImages(parsed);

  const narratives = [
    sections.define?.narrative,
    sections.measure?.narrative,
    sections.improve?.narrative,
  ].filter((n): n is JSONContent => !!n && n.type === "doc");

  for (const narrative of narratives) {
    if (!narrative.content?.length) continue;
    let pIdx = 0;
    const usedParsed = new Set<number>();
    for (let i = 0; i < narrative.content.length; i++) {
      const node = narrative.content[i]!;
      if (node.type !== "paragraph") continue;
      const expected = normalizePlain(paragraphPlainText(node));
      const expectedHasMedia = normalizeMediaPlaceholders(expected).includes("[media]");
      const found = findParsedParagraphMatch(expected, parsed, usedParsed, pIdx);
      if (!found) continue;

      const { matched, index: matchedIndex } = found;
      usedParsed.add(matchedIndex);
      if (!expectedHasMedia) pIdx = Math.max(pIdx, matchedIndex + 1);

      if (matched.isMathBlock && matched.parts[0]?.kind === "mathBlock") {
        replaceParagraphWithMathBlock(narrative, i, matched.parts[0]);
      } else {
        applyPartsToParagraph(node, matched.parts);
      }
    }
  }
}

/** @internal exported for tests */
export function parseParagraphXmlForTest(pXml: string, media: Map<string, MediaAsset>) {
  return parseParagraphXml(pXml, media);
}

/** @internal exported for tests */
export function plainTextMatchesForTest(candidate: string, expected: string) {
  return plainTextMatches(normalizePlain(candidate), normalizePlain(expected));
}
