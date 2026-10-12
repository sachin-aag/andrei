import type { JSONContent } from "@tiptap/core";
import {
  drawingEquals,
  parseImageDrawing,
  type DrawingOperation,
  type ImageDrawing,
} from "@/lib/drawings/overlay";

export type ApplyDrawingStatus =
  | "applied"
  | "already_present"
  | "not_found"
  | "ambiguous";

function walkImages(
  doc: JSONContent,
  visit: (node: JSONContent, index: number) => boolean | void
): void {
  let index = 0;
  const walk = (node: JSONContent): boolean => {
    if (node.type === "imageInline") {
      index += 1;
      if (visit(node, index) === true) return true;
    }
    for (const child of node.content ?? []) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(doc);
}

export function findInlineImageAtIndex(
  doc: JSONContent,
  index: number
): JSONContent | null {
  let found: JSONContent | null = null;
  walkImages(doc, (node, current) => {
    if (current === index) {
      found = node;
      return true;
    }
  });
  return found;
}

export function countInlineImages(doc: JSONContent | null | undefined): number {
  if (!doc) return 0;
  let count = 0;
  walkImages(doc, () => {
    count += 1;
  });
  return count;
}

export function applyDrawingOperationToDoc(
  doc: JSONContent,
  operation: DrawingOperation
): { ok: true; doc: JSONContent; status: ApplyDrawingStatus } | { ok: false; status: ApplyDrawingStatus } {
  const clone = structuredClone(doc) as JSONContent;
  const target = findInlineImageAtIndex(clone, operation.index);
  if (!target) return { ok: false, status: "not_found" };
  const current = parseImageDrawing(target.attrs?.drawing);
  if (drawingEquals(current, operation.drawing)) {
    return { ok: true, doc: clone, status: "already_present" };
  }
  target.attrs = {
    ...(target.attrs ?? {}),
    drawing: operation.drawing,
  };
  return { ok: true, doc: clone, status: "applied" };
}

export function imageDrawingFromNode(node: JSONContent | null | undefined): ImageDrawing | null {
  if (!node || node.type !== "imageInline") return null;
  return parseImageDrawing(node.attrs?.drawing);
}
