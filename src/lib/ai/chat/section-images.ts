import type { JSONContent } from "@tiptap/core";
import {
  CHAT_IMAGE_MAX_DATA_URL_CHARS,
  isAllowedChatImageMediaType,
} from "@/lib/ai/chat/image-parts";

/** Cap vision images returned from one read_section call. */
export const CHAT_SECTION_IMAGES_MAX = 4;

/**
 * Section narrative images may be compressed up to ~1MB (see compress-image),
 * larger than chat-upload caps — allow that ceiling for vision reads.
 */
export const CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS = Math.max(
  CHAT_IMAGE_MAX_DATA_URL_CHARS,
  Math.ceil(1_048_576 * 1.4) + 64
);

export type SectionInlineImage = {
  /** Stable label for the model, e.g. `narrative#1`. */
  id: string;
  targetField: string;
  /** 1-based index within this read_section response. */
  index: number;
  alt: string;
  mediaType: string;
  /** Full data URL used by toModelOutput; omit from persisted chat history. */
  dataUrl: string;
};

export type DocChatFlatten = {
  /** Anchor-compatible flatten (inline images → single space). */
  text: string;
  /** Same text with `[image:N]` markers for reading/describing. */
  readingText: string;
  imageCount: number;
};

type FlattenOptions = {
  targetField: string;
  imageIndexStart: number;
  collected: SectionInlineImage[];
  maxImages?: number;
  maxDataUrlChars?: number;
};

const BLOCK_SEPARATOR_TYPES = new Set([
  "doc",
  "blockquote",
  "listItem",
  "bulletList",
  "orderedList",
  "table",
  "tableRow",
  "codeBlock",
]);

export function countImagesInDoc(doc: JSONContent | null | undefined): number {
  if (!doc) return 0;
  let count = 0;
  const walk = (node: JSONContent) => {
    if (node.type === "imageInline") count += 1;
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return count;
}

function parseImageDataUrl(
  src: unknown,
  maxDataUrlChars: number
): { mediaType: string; dataUrl: string } | null {
  if (typeof src !== "string") return null;
  const dataUrl = src.trim();
  if (!dataUrl.startsWith("data:") || dataUrl.length > maxDataUrlChars) {
    return null;
  }
  const match = /^data:([^;,]+)/i.exec(dataUrl);
  if (!match) return null;
  const mediaType = match[1]!.trim().toLowerCase();
  if (!isAllowedChatImageMediaType(mediaType)) return null;
  if (!/;base64,/i.test(dataUrl)) return null;
  return { mediaType, dataUrl };
}

/**
 * Flatten a TipTap doc for chat: keep anchor-compatible `text`, and a
 * `readingText` that marks inline images as `[image:N]` while collecting
 * vision-ready payloads (capped).
 */
export function flattenDocForChat(
  doc: JSONContent | null | undefined,
  options: FlattenOptions
): DocChatFlatten {
  if (!doc) {
    return { text: "", readingText: "", imageCount: 0 };
  }

  const maxImages = options.maxImages ?? CHAT_SECTION_IMAGES_MAX;
  const maxDataUrlChars =
    options.maxDataUrlChars ?? CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS;
  const { targetField, collected } = options;

  let text = "";
  let readingText = "";
  let imageCount = 0;
  let nextIndex = options.imageIndexStart;

  const walk = (node: JSONContent) => {
    if (node.type === "text") {
      const t = node.text ?? "";
      text += t;
      readingText += t;
      return;
    }
    if (node.type === "hardBreak") {
      text += "\n";
      readingText += "\n";
      return;
    }
    if (node.type === "imageInline") {
      imageCount += 1;
      text += " ";
      const parsed = parseImageDataUrl(node.attrs?.src, maxDataUrlChars);
      if (parsed && collected.length < maxImages) {
        const index = nextIndex;
        nextIndex += 1;
        const alt =
          typeof node.attrs?.alt === "string" ? node.attrs.alt.trim() : "";
        collected.push({
          id: `${targetField}#${index}`,
          targetField,
          index,
          alt,
          mediaType: parsed.mediaType,
          dataUrl: parsed.dataUrl,
        });
        readingText += `[image:${index}]`;
      } else {
        // Oversized / unsupported / over cap — still mark presence for reading.
        readingText += "[image]";
      }
      return;
    }
    if (node.type === "mathInline" || node.type === "mathBlock") {
      text += " ";
      readingText += " ";
      return;
    }

    const inner = node.content;
    if (!inner?.length) return;

    if (BLOCK_SEPARATOR_TYPES.has(node.type ?? "")) {
      for (let i = 0; i < inner.length; i++) {
        if (i > 0) {
          text += "\n";
          readingText += "\n";
        }
        walk(inner[i]!);
      }
      return;
    }

    for (const child of inner) walk(child);
  };

  walk(doc);
  return { text, readingText, imageCount };
}

export function dataUrlToBase64(dataUrl: string): string | null {
  const idx = dataUrl.indexOf(";base64,");
  if (idx < 0) return null;
  const base64 = dataUrl.slice(idx + ";base64,".length).trim();
  return base64.length > 0 ? base64 : null;
}

/** Client/history-safe copy: drop bulky dataUrl payloads from read_section results. */
export function stripSectionImageDataUrls<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSectionImageDataUrls(item)) as T;
  }
  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (
      key === "dataUrl" &&
      typeof child === "string" &&
      child.startsWith("data:")
    ) {
      next[key] = "[omitted]";
      continue;
    }
    next[key] = stripSectionImageDataUrls(child);
  }
  return next as T;
}
