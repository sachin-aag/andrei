/** Narrow Tiptap / ProseMirror JSON doc shape (avoids @tiptap/core dependency). */
type TiptapJsonNode = {
  type?: string;
  text?: string;
  content?: TiptapJsonNode[];
};

const BLOCK = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
]);

/**
 * Pull plain text from a ProseMirror / Tiptap JSON doc (e.g. content saved
 * as rich text on another branch). Used when legacy UIs expect `string` fields.
 */
export function plainTextFromTiptapJson(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  const n = node as TiptapJsonNode;
  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }
  if (n.type === "hardBreak") {
    return "\n";
  }
  if (n.type === "doc" && Array.isArray(n.content)) {
    return n.content
      .map((c) => plainTextFromTiptapJson(c))
      .filter((s) => s.length > 0)
      .join("\n\n");
  }
  if (BLOCK.has(n.type ?? "") && Array.isArray(n.content)) {
    return n.content.map((c) => plainTextFromTiptapJson(c)).join("");
  }
  if (Array.isArray(n.content) && n.content.length > 0) {
    return n.content.map((c) => plainTextFromTiptapJson(c)).join("");
  }
  return "";
}

/**
 * If a section field is stored as a Tiptap document object but the UI expects a string, coerce.
 */
export function stringFieldFromStoredValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && (v as { type?: string }).type === "doc") {
    return plainTextFromTiptapJson(v);
  }
  if (v == null) return "";
  return "";
}
