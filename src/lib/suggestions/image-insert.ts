import type { JSONContent } from "@tiptap/core";
import { isAllowedChatImageMediaType } from "@/lib/ai/chat/image-parts";
import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";

export type SuggestionImageInsert = {
  src: string;
  alt?: string | null;
  width?: number | null;
  mediaId?: string | null;
};

const DATA_URL_RE = /^data:([^;,]+);base64,/i;

export function isValidSuggestionImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed.startsWith("data:") || trimmed.length > CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS) {
    return false;
  }
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return false;
  return isAllowedChatImageMediaType(match[1]!.trim().toLowerCase());
}

export function parseSuggestionImageInsert(
  raw: unknown
): SuggestionImageInsert | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.src !== "string" || !isValidSuggestionImageSrc(value.src)) {
    return undefined;
  }
  return {
    src: value.src.trim(),
    alt: typeof value.alt === "string" ? value.alt : null,
    width: typeof value.width === "number" && Number.isFinite(value.width) ? value.width : null,
    mediaId: typeof value.mediaId === "string" ? value.mediaId : null,
  };
}

export function pendingImageInlineNode(
  image: SuggestionImageInsert,
  suggestionId: string
): JSONContent {
  return {
    type: "imageInline",
    attrs: {
      src: image.src,
      alt: image.alt ?? null,
      width: image.width ?? null,
      mediaId: image.mediaId ?? null,
      suggestionId,
    },
  };
}

export function isPendingSuggestionImage(
  node: JSONContent,
  suggestionId: string
): boolean {
  return (
    node.type === "imageInline" &&
    (node.attrs as { suggestionId?: string | null } | undefined)?.suggestionId ===
      suggestionId
  );
}

export function docHasPendingImageSuggestion(
  doc: JSONContent,
  suggestionId: string
): boolean {
  const walk = (node: JSONContent): boolean => {
    if (isPendingSuggestionImage(node, suggestionId)) return true;
    return (node.content ?? []).some(walk);
  };
  return walk(doc);
}

/** Strip pending suggestionId from matching images (accept). */
export function acceptPendingImageSuggestions(
  node: JSONContent,
  suggestionId: string
): void {
  if (isPendingSuggestionImage(node, suggestionId) && node.attrs) {
    const next = { ...node.attrs };
    delete next.suggestionId;
    node.attrs = next;
  }
  node.content?.forEach((child) => acceptPendingImageSuggestions(child, suggestionId));
}

function isVisuallyEmptyBlock(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  return !(node.content ?? []).some((child) => {
    if (child.type === "text") return (child.text ?? "").length > 0;
    if (child.type === "hardBreak") return false;
    return true;
  });
}

/** Remove pending image nodes (dismiss). */
export function dropPendingImageSuggestions(
  node: JSONContent,
  suggestionId: string
): void {
  if (!node.content?.length) return;
  const next: JSONContent[] = [];
  for (const child of node.content) {
    if (isPendingSuggestionImage(child, suggestionId)) continue;
    const hadPending = docHasPendingImageSuggestion(child, suggestionId);
    dropPendingImageSuggestions(child, suggestionId);
    if (hadPending && isVisuallyEmptyBlock(child)) continue;
    next.push(child);
  }
  node.content = next;
  if (node.type === "doc" && node.content.length === 0) {
    node.content = [{ type: "paragraph" }];
  }
}

export function collectPendingImageSuggestionIds(
  doc: JSONContent,
  ids: Set<string>
): void {
  const walk = (node: JSONContent) => {
    if (node.type === "imageInline") {
      const id = (node.attrs as { suggestionId?: string | null } | undefined)
        ?.suggestionId;
      if (id) ids.add(id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
}

export type ListedInlineImage = {
  index: number;
  src: string;
  alt: string;
  width: number | null;
  mediaId: string | null;
};

/** 1-based document order of imageInline nodes (no vision cap). */
export function listInlineImagesInDoc(
  doc: JSONContent | null | undefined
): ListedInlineImage[] {
  if (!doc) return [];
  const listed: ListedInlineImage[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "imageInline") {
      const src =
        typeof node.attrs?.src === "string" ? node.attrs.src.trim() : "";
      if (!isValidSuggestionImageSrc(src)) return;
      listed.push({
        index: listed.length + 1,
        src,
        alt: typeof node.attrs?.alt === "string" ? node.attrs.alt : "",
        width:
          typeof node.attrs?.width === "number" && Number.isFinite(node.attrs.width)
            ? node.attrs.width
            : null,
        mediaId:
          typeof node.attrs?.mediaId === "string" ? node.attrs.mediaId : null,
      });
      return;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return listed;
}
