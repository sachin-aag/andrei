import PizZip from "pizzip";
import type { SectionType } from "@/db/schema";
import type { DocxExportContext, DocxCommentExportEntry } from "@/lib/export/docx-export-context";
import { getUser } from "@/lib/auth/mock-users";

export type ReportDocxComment = {
  id: string;
  parentId: string | null;
  section: SectionType | null;
  contentPath: string | null;
  authorId: string;
  content: string;
  anchorText: string;
  status: "open" | "resolved" | "dismissed";
  kind: string;
  source: string;
  externalAuthorName: string | null;
  externalAuthorInitials: string | null;
  externalCreatedAt: Date | string | null;
  createdAt: Date | string;
};

const WORDPROCESSING_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const COMMENTS_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENTS_EXTENDED_REL_TYPE =
  "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
const COMMENTS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
const COMMENTS_EXTENDED_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function asDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function authorName(comment: ReportDocxComment): string {
  if (comment.source === "word" || comment.kind === "word_import") {
    return comment.externalAuthorName || "Word reviewer";
  }
  if (comment.authorId === "ai") return "AI reviewer";
  return getUser(comment.authorId)?.name ?? comment.authorId;
}

function paraIdFor(appId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < appId.length; i++) {
    hash ^= appId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function registerComment(
  ctx: DocxExportContext,
  comment: ReportDocxComment,
  parent: DocxCommentExportEntry | null
): DocxCommentExportEntry {
  const existing = ctx.comments.find((entry) => entry.appId === comment.id);
  if (existing) return existing;

  const name = authorName(comment);
  const entry: DocxCommentExportEntry = {
    docxId: ctx.nextCommentId,
    appId: comment.id,
    parentAppId: parent?.appId ?? null,
    paraId: paraIdFor(comment.id),
    parentParaId: parent?.paraId ?? null,
    authorName: name,
    authorInitials: comment.externalAuthorInitials || initialsFromName(name),
    createdAt: asDate(comment.externalCreatedAt ?? comment.createdAt),
    content: comment.content,
  };
  ctx.nextCommentId += 1;
  ctx.comments.push(entry);
  return entry;
}

function commentReferenceXml(docxId: number): string {
  return (
    `<w:commentRangeStart w:id="${docxId}"/>` +
    `<w:commentRangeEnd w:id="${docxId}"/>` +
    `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>` +
    `<w:commentReference w:id="${docxId}"/></w:r>`
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attachCommentToAnchorText(
  xml: string,
  docxId: number,
  anchorText: string
): string | null {
  const needle = escapeXml(anchorText.trim());
  if (!needle) return null;

  const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  let match: RegExpExecArray | null;
  while ((match = runRe.exec(xml))) {
    const fullRun = match[0];
    const textMatch = /<w:t([^>]*)>([^<]*)<\/w:t>/.exec(fullRun);
    if (!textMatch) continue;

    const tAttrs = textMatch[1] ?? "";
    const text = textMatch[2] ?? "";
    if (!text.includes(needle)) continue;

    const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(fullRun)?.[0] ?? "";
    const idx = text.indexOf(needle);
    if (idx === -1) return null;

    const before = text.slice(0, idx);
    const selected = text.slice(idx, idx + needle.length);
    const after = text.slice(idx + needle.length);
    const run = (value: string) =>
      value ? `<w:r>${rPr}<w:t${tAttrs}>${value}</w:t></w:r>` : "";
    const replacement =
      run(before) +
      `<w:commentRangeStart w:id="${docxId}"/>` +
      run(selected) +
      `<w:commentRangeEnd w:id="${docxId}"/>` +
      `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>` +
      `<w:commentReference w:id="${docxId}"/></w:r>` +
      run(after);

    return `${xml.slice(0, match.index)}${replacement}${xml.slice(match.index + fullRun.length)}`;
  }

  return null;
}

export function attachCommentsToFirstParagraph(
  xml: string,
  ctx: DocxExportContext,
  root: ReportDocxComment,
  replies: ReportDocxComment[]
): string {
  if (!xml || root.status === "dismissed") return xml;
  const rootEntry = registerComment(ctx, root, null);
  for (const reply of replies) {
    if (reply.status !== "dismissed") registerComment(ctx, reply, rootEntry);
  }

  const anchoredXml = attachCommentToAnchorText(
    xml,
    rootEntry.docxId,
    root.anchorText
  );
  if (anchoredXml) return anchoredXml;

  const marker = commentReferenceXml(rootEntry.docxId);
  const paragraphStart =
    /<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?/.exec(xml);
  if (!paragraphStart) return `${marker}${xml}`;
  const insertAt = paragraphStart.index + paragraphStart[0].length;
  return `${xml.slice(0, insertAt)}${marker}${xml.slice(insertAt)}`;
}

function commentsXml(entries: DocxCommentExportEntry[]): string {
  const body = entries
    .map((entry) => {
      const lines = entry.content.split(/\r?\n/);
      const runs = lines
        .map((line, index) => {
          const breakXml = index === 0 ? "" : "<w:br/>";
          return `${breakXml}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
        })
        .join("");
      return (
        `<w:comment w:id="${entry.docxId}" w:author="${escapeXml(entry.authorName)}" ` +
        `w:initials="${escapeXml(entry.authorInitials)}" w:date="${entry.createdAt.toISOString()}">` +
        `<w:p w14:paraId="${entry.paraId}" w14:textId="77777777">` +
        `<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>` +
        `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>` +
        `<w:r>${runs}</w:r>` +
        `</w:p></w:comment>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">` +
    body +
    `</w:comments>`
  );
}

function commentsExtendedXml(entries: DocxCommentExportEntry[]): string {
  const body = entries
    .map((entry) => {
      const parent = entry.parentParaId
        ? ` w15:paraIdParent="${entry.parentParaId}"`
        : "";
      return `<w15:commentEx w15:paraId="${entry.paraId}" w15:done="0"${parent}/>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">` +
    body +
    `</w15:commentsEx>`
  );
}

function ensureOverride(contentTypesXml: string, partName: string, contentType: string): string {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    "</Types>",
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
  );
}

function nextRelId(relsXml: string): string {
  const ids = Array.from(relsXml.matchAll(/\bId="rId(\d+)"/g)).map((m) =>
    Number(m[1])
  );
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensureRelationship(relsXml: string, type: string, target: string): string {
  if (relsXml.includes(`Type="${type}"`) && relsXml.includes(`Target="${target}"`)) {
    return relsXml;
  }
  const id = nextRelId(relsXml);
  return relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`
  );
}

export function applyWordCommentsToDocxZip(zip: PizZip, ctx: DocxExportContext): void {
  if (ctx.comments.length === 0) return;

  zip.file("word/comments.xml", commentsXml(ctx.comments));
  zip.file("word/commentsExtended.xml", commentsExtendedXml(ctx.comments));

  const contentTypes = zip.file("[Content_Types].xml")?.asText();
  if (contentTypes) {
    zip.file(
      "[Content_Types].xml",
      ensureOverride(
        ensureOverride(contentTypes, "/word/comments.xml", COMMENTS_CONTENT_TYPE),
        "/word/commentsExtended.xml",
        COMMENTS_EXTENDED_CONTENT_TYPE
      )
    );
  }

  const relsPath = "word/_rels/document.xml.rels";
  const relsXml =
    zip.file(relsPath)?.asText() ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${WORDPROCESSING_REL_NS}"></Relationships>`;
  zip.file(
    relsPath,
    ensureRelationship(
      ensureRelationship(relsXml, COMMENTS_REL_TYPE, "comments.xml"),
      COMMENTS_EXTENDED_REL_TYPE,
      "commentsExtended.xml"
    )
  );
}
