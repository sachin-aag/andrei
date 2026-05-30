import type { Node as PmNode } from "@tiptap/pm/model";
import type { SectionType } from "@/db/schema";
import {
  findPlaceholdersInPmDoc as scanPlaceholdersInPmDoc,
  type Placeholder,
} from "./find";

export function findPlaceholdersInPmDoc(
  doc: PmNode,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  return scanPlaceholdersInPmDoc(doc, section, contentPath);
}

/** Map a section-state placeholder to the current ProseMirror document when possible. */
export function resolvePlaceholderInPmDoc(
  doc: PmNode,
  placeholder: Placeholder
): Placeholder | null {
  const live = findPlaceholdersInPmDoc(
    doc,
    placeholder.section,
    placeholder.contentPath
  );

  const exact = live.find((p) => p.id === placeholder.id);
  if (exact) return exact;

  const sameText = live.filter((p) => p.text === placeholder.text);
  if (sameText.length === 1) return sameText[0]!;

  if (sameText.length > 1) {
    let best = sameText[0]!;
    let bestDist = Math.abs(best.fromPos - placeholder.fromPos);
    for (const candidate of sameText.slice(1)) {
      const dist = Math.abs(candidate.fromPos - placeholder.fromPos);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return best;
  }

  return null;
}

export function getPlaceholderSurroundingText(
  doc: PmNode,
  fromPos: number,
  toPos: number,
  radius = 50
): { beforeCtx: string; afterCtx: string } {
  const size = doc.content.size;
  if (fromPos < 0 || toPos > size || fromPos >= toPos) {
    return { beforeCtx: "", afterCtx: "" };
  }

  try {
    doc.resolve(fromPos);
    doc.resolve(toPos);
  } catch {
    return { beforeCtx: "", afterCtx: "" };
  }

  try {
    const ctxFrom = Math.max(0, fromPos - radius);
    const ctxTo = Math.min(size, toPos + radius);
    return {
      beforeCtx: ctxFrom < fromPos ? doc.textBetween(ctxFrom, fromPos, " ") : "",
      afterCtx: toPos < ctxTo ? doc.textBetween(toPos, ctxTo, " ") : "",
    };
  } catch {
    return { beforeCtx: "", afterCtx: "" };
  }
}

export function placeholderPanelContext(
  doc: PmNode,
  placeholder: Placeholder
): { beforeCtx: string; afterCtx: string } {
  const live = resolvePlaceholderInPmDoc(doc, placeholder);
  if (!live) return { beforeCtx: "", afterCtx: "" };
  return getPlaceholderSurroundingText(doc, live.fromPos, live.toPos);
}
