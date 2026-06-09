import type { JSONContent } from "@tiptap/core";
import { emptyDoc, legacyStringToDoc, normalizeRichField } from "@/lib/tiptap/rich-text";

/** Read a rich JSONContent field from section JSON by dot path. */
export function getRichFieldValue(
  content: Record<string, unknown>,
  path: string
): JSONContent {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = content;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) {
      return emptyDoc();
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur === "string") return legacyStringToDoc(cur);
  return normalizeRichField(cur);
}

/** Write a rich JSONContent field at a dot path (returns a cloned section record). */
export function setRichFieldValue(
  content: Record<string, unknown>,
  path: string,
  doc: JSONContent
): Record<string, unknown> {
  const next = structuredClone(content);
  const parts = path.split(".").filter(Boolean);
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = doc;
  return next;
}
