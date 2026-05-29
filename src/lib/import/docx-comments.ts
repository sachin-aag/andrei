import {
  DOMParser,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import PizZip from "pizzip";
import type { SectionType } from "@/db/schema";
import { EDITABLE_SECTIONS, SECTION_LABELS } from "@/types/sections";

export type ImportedWordComment = {
  externalCommentId: string;
  parentExternalCommentId: string | null;
  authorName: string;
  authorInitials: string | null;
  createdAt: Date | null;
  content: string;
  anchorText: string;
  section: SectionType | null;
};

type CommentMetadata = {
  id: string;
  paraId: string | null;
  authorName: string;
  authorInitials: string | null;
  createdAt: Date | null;
  content: string;
};

type RangeAnchor = {
  start: number;
  end: number | null;
};

const WORD_COMMENTS_PATH = "word/comments.xml";
const WORD_COMMENTS_EXTENDED_PATH = "word/commentsExtended.xml";
const WORD_DOCUMENT_PATH = "word/document.xml";

function parseXml(xml: string): XmlDocument {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function nodeLocalName(node: XmlNode): string {
  return node.nodeName.split(":").at(-1) ?? node.nodeName;
}

function getAttr(el: XmlElement, localName: string): string | null {
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes.item(i);
    if (!attr) continue;
    const name = attr.localName ?? attr.name.split(":").at(-1) ?? attr.name;
    if (name === localName) return attr.value;
  }
  return null;
}

function getElementsByLocalName(root: XmlDocument | XmlElement, localName: string): XmlElement[] {
  const out: XmlElement[] = [];
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (el && nodeLocalName(el) === localName) out.push(el);
  }
  return out;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCommentText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textFromElement(root: XmlElement): string {
  const parts: string[] = [];

  function visit(node: XmlNode) {
    if (node.nodeType !== 1) return;
    const el = node as XmlElement;
    const local = nodeLocalName(el);
    if (local === "t") {
      parts.push(el.textContent ?? "");
      return;
    }
    if (local === "tab") {
      parts.push("\t");
      return;
    }
    if (local === "br" || local === "cr") {
      parts.push("\n");
      return;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes.item(i);
      if (child) visit(child);
    }
    if (local === "p") parts.push("\n");
  }

  visit(root);
  return normalizeCommentText(parts.join(""));
}

function readCommentMetadata(zip: PizZip): CommentMetadata[] {
  const xml = zip.file(WORD_COMMENTS_PATH)?.asText();
  if (!xml) return [];
  const doc = parseXml(xml);
  return getElementsByLocalName(doc, "comment").flatMap((comment) => {
    const id = getAttr(comment, "id");
    if (!id) return [];
    return [{
      id,
      paraId: getAttr(comment, "paraId"),
      authorName: getAttr(comment, "author")?.trim() || "Word reviewer",
      authorInitials: getAttr(comment, "initials"),
      createdAt: parseDate(getAttr(comment, "date")),
      content: textFromElement(comment),
    }];
  });
}

function readReplyParents(zip: PizZip): Map<string, string> {
  const xml = zip.file(WORD_COMMENTS_EXTENDED_PATH)?.asText();
  if (!xml) return new Map();
  const doc = parseXml(xml);
  const parentByParaId = new Map<string, string>();
  for (const commentEx of getElementsByLocalName(doc, "commentEx")) {
    const paraId = getAttr(commentEx, "paraId");
    const parentParaId = getAttr(commentEx, "paraIdParent");
    if (paraId && parentParaId) parentByParaId.set(paraId, parentParaId);
  }
  return parentByParaId;
}

function readDocumentTextAndAnchors(zip: PizZip): {
  text: string;
  anchors: Map<string, RangeAnchor>;
} {
  const xml = zip.file(WORD_DOCUMENT_PATH)?.asText();
  if (!xml) return { text: "", anchors: new Map() };
  const doc = parseXml(xml);
  const anchors = new Map<string, RangeAnchor>();
  const parts: string[] = [];

  function visit(node: XmlNode) {
    if (node.nodeType !== 1) return;
    const el = node as XmlElement;
    const local = nodeLocalName(el);
    if (local === "commentRangeStart") {
      const id = getAttr(el, "id");
      if (id) anchors.set(id, { start: parts.join("").length, end: null });
      return;
    }
    if (local === "commentRangeEnd") {
      const id = getAttr(el, "id");
      const anchor = id ? anchors.get(id) : undefined;
      if (anchor) anchor.end = parts.join("").length;
      return;
    }
    if (local === "t") {
      parts.push(el.textContent ?? "");
      return;
    }
    if (local === "tab") {
      parts.push("\t");
      return;
    }
    if (local === "br" || local === "cr") {
      parts.push("\n");
      return;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes.item(i);
      if (child) visit(child);
    }
    if (local === "p") parts.push("\n");
  }

  const body = getElementsByLocalName(doc, "body")[0] ?? doc.documentElement;
  visit(body);
  return { text: parts.join(""), anchors };
}

function sectionFromDocumentPosition(text: string, position: number): SectionType | null {
  const prefix = text.slice(0, Math.max(0, position));
  let best: { section: SectionType; index: number } | null = null;
  for (const section of EDITABLE_SECTIONS) {
    const label = SECTION_LABELS[section];
    const re = new RegExp(`(?:^|\\n)\\s*(?:\\d+(?:\\.\\d+)*\\.?\\s+)?${label}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(prefix))) {
      if (!best || match.index >= best.index) {
        best = { section, index: match.index };
      }
    }
  }
  return best?.section ?? null;
}

export function extractWordCommentsFromDocxBuffer(buffer: Buffer): ImportedWordComment[] {
  const zip = new PizZip(buffer);
  const metadata = readCommentMetadata(zip).filter((comment) => comment.content);
  if (metadata.length === 0) return [];

  const parentParaByParaId = readReplyParents(zip);
  const commentIdByParaId = new Map(
    metadata.flatMap((comment) => comment.paraId ? [[comment.paraId, comment.id] as const] : [])
  );
  const { text, anchors } = readDocumentTextAndAnchors(zip);

  return metadata.map((comment) => {
    const anchor = anchors.get(comment.id);
    const anchorText =
      anchor && anchor.end != null && anchor.end > anchor.start
        ? normalizeCommentText(text.slice(anchor.start, anchor.end))
        : "";
    const parentParaId = comment.paraId ? parentParaByParaId.get(comment.paraId) : undefined;
    return {
      externalCommentId: comment.id,
      parentExternalCommentId: parentParaId ? commentIdByParaId.get(parentParaId) ?? null : null,
      authorName: comment.authorName,
      authorInitials: comment.authorInitials,
      createdAt: comment.createdAt,
      content: comment.content,
      anchorText,
      section: anchor ? sectionFromDocumentPosition(text, anchor.start) : null,
    };
  });
}
