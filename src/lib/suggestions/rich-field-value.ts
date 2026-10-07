import type { JSONContent } from "@tiptap/core";
import {
  emptyDoc,
  legacyStringToDoc,
  normalizeRichField,
  type NormalizeRichFieldOptions,
} from "@/lib/tiptap/rich-text";

function isIndexPart(part: string): boolean {
  return /^\d+$/.test(part);
}

/** Read a rich JSONContent field from section JSON by dot path (`items.0`). */
export function getRichFieldValue(
  content: Record<string, unknown>,
  path: string,
  options?: NormalizeRichFieldOptions
): JSONContent {
  if (
    path === "items.0" &&
    !Array.isArray(content.items) &&
    content.narrative != null
  ) {
    return normalizeRichField(content.narrative, options);
  }
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = content;
  for (const part of parts) {
    if (cur == null) return emptyDoc();
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        return emptyDoc();
      }
      cur = cur[idx];
      continue;
    }
    if (typeof cur !== "object") return emptyDoc();
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur === "string") return legacyStringToDoc(cur);
  return normalizeRichField(cur, options);
}

/** Write a rich JSONContent field at a dot path (pads arrays for `items.N`). */
export function setRichFieldValue(
  content: Record<string, unknown>,
  path: string,
  doc: JSONContent
): Record<string, unknown> {
  const next = structuredClone(content);
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return next;

  let cursor: unknown = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const nextIsIndex = isIndexPart(parts[i + 1]!);
    if (Array.isArray(cursor)) {
      const idx = Number(key);
      while (cursor.length <= idx) cursor.push(nextIsIndex ? [] : {});
      if (cursor[idx] == null) cursor[idx] = nextIsIndex ? [] : {};
      cursor = cursor[idx];
      continue;
    }
    if (cursor == null || typeof cursor !== "object") return next;
    const rec = cursor as Record<string, unknown>;
    if (nextIsIndex) {
      if (!Array.isArray(rec[key])) rec[key] = [];
    } else if (!rec[key] || typeof rec[key] !== "object" || Array.isArray(rec[key])) {
      rec[key] = {};
    }
    cursor = rec[key];
  }

  const last = parts[parts.length - 1]!;
  if (Array.isArray(cursor)) {
    const idx = Number(last);
    if (!Number.isInteger(idx) || idx < 0) return next;
    while (cursor.length <= idx) cursor.push(emptyDoc());
    cursor[idx] = doc;
    return next;
  }
  if (cursor && typeof cursor === "object") {
    (cursor as Record<string, unknown>)[last] = doc;
  }
  return next;
}
