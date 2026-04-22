import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

/** Empty Tiptap document (single empty paragraph). */
export function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/** Convert legacy plain-text narrative to a minimal doc (paragraphs by line breaks). */
export function legacyStringToDoc(s: string): JSONContent {
  if (!s.trim()) return emptyDoc();
  const lines = s.split(/\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line.length ? [{ type: "text", text: line }] : [],
    })),
  };
}

/** Normalize DB/client value to JSONContent (handles legacy strings). */
export function normalizeRichField(v: unknown): JSONContent {
  if (v && typeof v === "object" && "type" in v && (v as JSONContent).type === "doc") {
    return v as JSONContent;
  }
  if (typeof v === "string") {
    return legacyStringToDoc(v);
  }
  return emptyDoc();
}

/** Plain text for export / AI (walks text nodes; paragraphs → newlines). */
export function richJsonToPlainText(doc: JSONContent | undefined | null): string {
  if (!doc) return "";
  const parts: string[] = [];

  function walk(node: JSONContent, blockSep: string) {
    if (node.type === "text") {
      parts.push(node.text ?? "");
      return;
    }
    const inner = node.content;
    if (!inner?.length) return;
    if (node.type === "paragraph") {
      const line: string[] = [];
      for (const ch of inner) walk(ch, "");
      parts.push(line.join("") + blockSep);
      return;
    }
    if (node.type === "heading") {
      for (const ch of inner) walk(ch, "");
      parts.push("\n");
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "doc") {
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]!;
        const isBlock = ["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList"].includes(
          ch.type ?? ""
        );
        walk(ch, isBlock ? "\n\n" : "");
      }
      return;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of inner) walk(item, "\n");
      return;
    }
    if (node.type === "listItem") {
      for (const ch of inner) walk(ch, "\n");
      return;
    }
    for (const ch of inner) walk(ch, blockSep);
  }

  walk(doc, "\n");
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove track-change marks from a doc (engineer draft cleanup; keeps manager review marks elsewhere). */
export function stripSuggestionMarksFromDoc(doc: JSONContent): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "text" && node.marks?.length) {
      const marks = node.marks.filter(
        (m) =>
          m.type !== suggestionInsertMarkName && m.type !== suggestionDeleteMarkName
      );
      const next: JSONContent = { ...node };
      if (marks.length > 0) next.marks = marks;
      else delete next.marks;
      return next;
    }
    if (node.content?.length) {
      return {
        ...node,
        content: node.content.map(visit),
      };
    }
    return node;
  }
  return visit(doc);
}
