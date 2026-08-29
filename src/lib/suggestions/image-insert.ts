import type { JSONContent } from "@tiptap/core";
import { isAllowedChatImageMediaType } from "@/lib/ai/chat/image-parts";
import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";
import { parseChartSpec, type ChartSpec } from "@/lib/charts/chart-spec";

export type SuggestionImageInsert = {
  src: string;
  alt?: string | null;
  width?: number | null;
  mediaId?: string | null;
  /** Audit trail for agent-generated plots. Absent on human photos. */
  chartSpec?: ChartSpec | null;
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
  const chartSpec = parseChartSpec(value.chartSpec);
  return {
    src: value.src.trim(),
    alt: typeof value.alt === "string" ? value.alt : null,
    width: typeof value.width === "number" && Number.isFinite(value.width) ? value.width : null,
    mediaId: typeof value.mediaId === "string" ? value.mediaId : null,
    ...(chartSpec ? { chartSpec } : {}),
  };
}

export type SuggestionImageKind = "insert" | "delete";

export type SuggestionImageRemove = SuggestionImageInsert & {
  /** 1-based imageInline index in the field when the suggestion was created. */
  index: number;
};

export function parseSuggestionImageRemove(
  raw: unknown
): SuggestionImageRemove | undefined {
  const image = parseSuggestionImageInsert(raw);
  if (!image || !raw || typeof raw !== "object") return undefined;
  const index = (raw as Record<string, unknown>).index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1) {
    return undefined;
  }
  return { ...image, index };
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
      chartSpec: parseChartSpec(image.chartSpec),
      suggestionId,
      suggestionKind: "insert",
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

function pendingImageKind(
  node: JSONContent,
  suggestionId: string
): SuggestionImageKind | null {
  if (!isPendingSuggestionImage(node, suggestionId)) return null;
  return node.attrs?.suggestionKind === "delete" ? "delete" : "insert";
}

function shouldDropPendingImage(
  node: JSONContent,
  suggestionId: string,
  outcome: "accept" | "dismiss"
): boolean {
  const kind = pendingImageKind(node, suggestionId);
  if (!kind) return false;
  return outcome === "accept" ? kind === "delete" : kind === "insert";
}

function stripPendingImageAttrs(node: JSONContent, suggestionId: string): void {
  if (!isPendingSuggestionImage(node, suggestionId) || !node.attrs) return;
  const next = { ...node.attrs };
  delete next.suggestionId;
  delete next.suggestionKind;
  node.attrs = next;
}

function resolvePendingImageSuggestions(
  node: JSONContent,
  suggestionId: string,
  outcome: "accept" | "dismiss"
): void {
  if (!node.content?.length) {
    if (!shouldDropPendingImage(node, suggestionId, outcome)) {
      stripPendingImageAttrs(node, suggestionId);
    }
    return;
  }
  const next: JSONContent[] = [];
  for (const child of node.content) {
    if (shouldDropPendingImage(child, suggestionId, outcome)) continue;
    const hadPending = docHasPendingImageSuggestion(child, suggestionId);
    resolvePendingImageSuggestions(child, suggestionId, outcome);
    stripPendingImageAttrs(child, suggestionId);
    if (hadPending && isVisuallyEmptyBlock(child)) continue;
    next.push(child);
  }
  node.content = next;
  if (node.type === "doc" && node.content.length === 0) {
    node.content = [{ type: "paragraph" }];
  }
}

/** Accept: keep inserts (strip overlay), drop deletions. */
export function acceptPendingImageSuggestions(
  node: JSONContent,
  suggestionId: string
): void {
  resolvePendingImageSuggestions(node, suggestionId, "accept");
}

function isVisuallyEmptyBlock(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  return !(node.content ?? []).some((child) => {
    if (child.type === "text") return (child.text ?? "").length > 0;
    if (child.type === "hardBreak") return false;
    return true;
  });
}

/** Dismiss: drop pending inserts, keep deletions (strip overlay). */
export function dropPendingImageSuggestions(
  node: JSONContent,
  suggestionId: string
): void {
  resolvePendingImageSuggestions(node, suggestionId, "dismiss");
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
  chartSpec: ChartSpec | null;
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
        chartSpec: parseChartSpec(node.attrs?.chartSpec),
      });
      return;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return listed;
}

export type ImageRemovalLocateStatus = "located" | "not_found" | "ambiguous";

function resolveRemovalTarget(
  doc: JSONContent,
  removal: SuggestionImageRemove
):
  | { status: "located"; target: ListedInlineImage }
  | { status: "not_found" | "ambiguous" } {
  const images = listInlineImagesInDoc(doc);
  if (images.length === 0) return { status: "not_found" };

  const atIndex = images[removal.index - 1];
  if (atIndex?.src === removal.src) {
    return { status: "located", target: atIndex };
  }

  const srcMatches = images.filter((image) => image.src === removal.src);
  if (srcMatches.length === 1) {
    return { status: "located", target: srcMatches[0]! };
  }
  if (srcMatches.length > 1) return { status: "ambiguous" };
  return { status: "not_found" };
}

export function locateImageRemoval(
  doc: JSONContent,
  removal: SuggestionImageRemove
): ImageRemovalLocateStatus {
  return resolveRemovalTarget(doc, removal).status;
}

export function markImageForDeletion(
  doc: JSONContent,
  removal: SuggestionImageRemove,
  suggestionId: string
): boolean {
  const resolved = resolveRemovalTarget(doc, removal);
  if (resolved.status !== "located") return false;

  let marked = false;
  let seen = 0;
  const walk = (node: JSONContent): void => {
    if (marked) return;
    if (node.type === "imageInline") {
      const src =
        typeof node.attrs?.src === "string" ? node.attrs.src.trim() : "";
      if (!isValidSuggestionImageSrc(src)) return;
      seen += 1;
      if (seen === resolved.target.index) {
        node.attrs = {
          ...(node.attrs ?? {}),
          suggestionId,
          suggestionKind: "delete",
        };
        marked = true;
      }
      return;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return marked;
}

/** Insert a pending figure immediately after the delete-marked node (in-place replace). */
export function insertPendingImageAfterDeletionMark(
  doc: JSONContent,
  image: SuggestionImageInsert,
  suggestionId: string
): boolean {
  const node = pendingImageInlineNode(image, suggestionId);
  const walk = (parent: JSONContent): boolean => {
    const content = parent.content;
    if (!content) return false;
    for (let i = 0; i < content.length; i++) {
      const child = content[i]!;
      if (
        child.type === "imageInline" &&
        child.attrs?.suggestionId === suggestionId &&
        child.attrs?.suggestionKind === "delete"
      ) {
        content.splice(i + 1, 0, node);
        return true;
      }
      if (walk(child)) return true;
    }
    return false;
  };
  return walk(doc);
}
