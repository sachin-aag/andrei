"use client";

import {
  type RefObject,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useReportComments,
  useReportData,
  useReportEditors,
  useReportEvaluations,
} from "@/providers/report-provider";
import { CommentCard } from "./comment-card";
import { SectionCommentComposer } from "./section-comment-composer";
import { SectionSuggestionCard } from "@/components/report/suggestion-card";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { isNarrativeTargetField } from "@/lib/ai/suggest-target-fields";
import { suggestionFieldAnchorKey } from "@/lib/suggestions/resolve-suggestion-field-path";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { cn } from "@/lib/utils";
import { useUserDirectory } from "@/providers/user-directory-provider";
import type { Editor } from "@tiptap/react";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

export type GutterAnchor = {
  /** Stable id: comment id, `composer:<section>`, `unanchored:<commentId>`, or `overflow:<section>`. */
  id: string;
  type:
    | "comment"
    | "composer"
    | "field-comment"
    | "unanchored-comment"
    | "suggestion";
  desiredTop: number;
  /** When true, desiredTop is the vertical center of the target field (card is centered on it). */
  valignCenter?: boolean;
  section?: SectionType;
  comment?: CommentRecord;
};

const CARD_GAP = 8;
const HEIGHT_EPSILON = 2;

function measureCardHeights(
  anchors: GutterAnchor[],
  cardRefs: RefObject<Record<string, HTMLDivElement | null>>,
  prev: Record<string, number>
): Record<string, number> {
  const next: Record<string, number> = {};
  let changed = false;

  for (const a of anchors) {
    const el = cardRefs.current[a.id];
    const h = el?.getBoundingClientRect().height ?? prev[a.id];
    if (h == null) continue;
    next[a.id] = h;
    if (Math.abs((prev[a.id] ?? 0) - h) > HEIGHT_EPSILON) {
      changed = true;
    }
  }

  if (!changed && Object.keys(prev).length === Object.keys(next).length) {
    return prev;
  }
  return next;
}

function connectorLinesEqual(
  a: { id: string; y: number }[],
  b: { id: string; y: number }[]
) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || Math.abs(a[i].y - b[i].y) > 1) {
      return false;
    }
  }
  return true;
}

function queryFieldAnchor(section: SectionType, contentPath: string): HTMLElement | null {
  const css = globalThis.CSS;
  const value = `${section}.${contentPath}`;
  const escaped = css?.escape ? css.escape(value) : value.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-field-anchor="${escaped}"]`);
}

function findSuggestionMarkPos(editor: Editor, markId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found != null) return false;
    if (!node.isText || !node.marks?.length) return;
    for (const mark of node.marks) {
      const attrs = mark.attrs as { id?: string | null } | undefined;
      if (attrs?.id === markId) {
        found = pos;
        return false;
      }
    }
  });
  return found;
}

function findSuggestionMarkRange(
  editor: Editor,
  markId: string
): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.marks?.length) return;
    const len = node.text?.length ?? 0;
    for (const mark of node.marks) {
      const attrs = mark.attrs as { id?: string | null } | undefined;
      if (attrs?.id !== markId) continue;
      if (
        mark.type.name !== suggestionInsertMarkName &&
        mark.type.name !== suggestionDeleteMarkName
      ) {
        continue;
      }
      from = from === null ? pos : Math.min(from, pos);
      to = to === null ? pos + len : Math.max(to, pos + len);
    }
  });
  if (from === null || to === null) return null;
  return { from, to };
}

function elementCenterY(el: HTMLElement, containerTop: number): number {
  const rect = el.getBoundingClientRect();
  return rect.top + rect.height / 2 - containerTop;
}

function suggestionCenterYInEditor(
  editor: Editor,
  markId: string,
  containerTop: number,
  fromPos?: number | null
): number | null {
  const view = editor.view;
  const docSize = view.state.doc.content.size;
  const range = findSuggestionMarkRange(editor, markId);
  if (range) {
    const safeFrom = Math.max(0, Math.min(range.from, docSize));
    const safeTo = Math.max(safeFrom, Math.min(range.to, docSize));
    try {
      const start = view.coordsAtPos(safeFrom);
      const end = view.coordsAtPos(safeTo);
      return (start.top + end.bottom) / 2 - containerTop;
    } catch {
      // fall through
    }
  }
  const pos =
    fromPos != null
      ? Math.max(0, Math.min(fromPos, docSize))
      : findSuggestionMarkPos(editor, markId);
  if (pos == null) return null;
  try {
    const coords = view.coordsAtPos(pos);
    return coords.top + (coords.bottom - coords.top) / 2 - containerTop;
  } catch {
    return null;
  }
}

function queryFieldAnchorKey(anchorKey: string): HTMLElement | null {
  const css = globalThis.CSS;
  const escaped = css?.escape ? css.escape(anchorKey) : anchorKey.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-field-anchor="${escaped}"]`);
}

type Props = {
  onSectionOverflow?: (overflows: Record<SectionType, number>) => void;
};

/**
 * Right-margin gutter (Word/Google-Docs style) that lays out comment threads
 * and AI suggestion cards aligned to their inline anchor in the document.
 *
 * Positioning math: for each anchor we compute its top relative to the gutter
 * container (which sits inside the same scrollable area as the document). A
 * greedy top-down packer then pushes overlapping cards downward so they never
 * overlap.
 */
export function MarginGutter({ onSectionOverflow }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { report, workspaceMode, currentUserId } = useReportData();
  const {
    comments,
    activeAnchorId,
    setActiveAnchorId,
    setActiveCommentId,
    hoveredCommentIds,
  } = useReportComments();
  const { getEditor, editorTick } = useReportEditors();
  const { evaluations, gutterSuggestionCommentForSection } =
    useReportEvaluations();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const cardHeightsRef = useRef<Record<string, number>>({});
  const [anchors, setAnchors] = useState<GutterAnchor[]>([]);
  const [connectorLines, setConnectorLines] = useState<{ id: string; y: number }[]>([]);
  const connectorLinesRef = useRef<{ id: string; y: number }[]>([]);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { getUser } = useUserDirectory();
  const isManager = getUser(currentUserId)?.role === "manager";
  const isAuthor = currentUserId === report.authorId;
  const canComment =
    (isManager && workspaceMode === "review" && (report.status === "submitted" || report.status === "in_review")) ||
    (isAuthor && (report.status === "draft" || report.status === "submitted" || report.status === "in_review"));

  // The gutter and document live in the same scroll container, so relative anchor
  // offsets do not change while scrolling. Recompute for mount/resize/layout
  // changes only; scroll-frame updates make the rail visibly flicker.
  useEffect(() => {
    let frame: number | null = null;
    const requestLayout = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setLayoutVersion((n) => n + 1);
      });
    };

    requestLayout();
    window.addEventListener("resize", requestLayout);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(requestLayout)
        : null;
    if (containerRef.current) observer?.observe(containerRef.current);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", requestLayout);
    };
  }, []);

  useLayoutEffect(() => {
    void layoutVersion;
    void editorTick;
    const container = containerRef.current;
    if (!container) {
      setAnchors([]);
      return;
    }
    const containerTop = container.getBoundingClientRect().top;

    const result: GutterAnchor[] = [];

    // 1. Section composer cards pinned at the top of each section.
    if (canComment) {
      for (const section of EVALUATABLE_SECTIONS) {
        const heading = document.getElementById(section);
        if (!heading) continue;
        const top = heading.getBoundingClientRect().top - containerTop;
        result.push({
          id: `composer:${section}`,
          type: "composer",
          desiredTop: top,
          section,
        });
      }
    }

    // 2. Comments — editor comments use Tiptap coords, field comments use
    // form-control anchors, and fully unanchored comments go to the section header.
    // Filter out AI comments — they are no longer shown as gutter cards.
    for (const c of comments) {
      if (c.parentId) continue;
      if ((c.kind ?? "human").startsWith("ai_")) continue;
      const isEditorAnchored =
        c.section &&
        c.contentPath &&
        c.fromPos != null &&
        c.toPos != null;
      const fieldAnchor =
        c.section && c.contentPath && !isEditorAnchored
          ? queryFieldAnchor(c.section as SectionType, c.contentPath)
          : null;

      if (isEditorAnchored) {
        const editor = getEditor(c.section as SectionType, c.contentPath as string);
        if (!editor) continue;
        const view = editor.view;
        const docSize = view.state.doc.content.size;
        const safeFrom = Math.max(0, Math.min(c.fromPos!, docSize));
        try {
          const coords = view.coordsAtPos(safeFrom);
          const top = coords.top - containerTop;
          result.push({
            id: c.id,
            type: "comment",
            desiredTop: top,
            section: c.section as SectionType,
            comment: c,
          });
        } catch {
          // ignore positioning errors (doc may have shrunk below this pos)
        }
      } else if (fieldAnchor && c.section) {
        const top = fieldAnchor.getBoundingClientRect().top - containerTop;
        result.push({
          id: `field:${c.id}`,
          type: "field-comment",
          desiredTop: top,
          section: c.section,
          comment: c,
        });
      } else if (c.section) {
        const heading = document.getElementById(c.section);
        if (!heading) continue;
        const top = heading.getBoundingClientRect().top - containerTop;
        result.push({
          id: `unanchored:${c.id}`,
          type: "unanchored-comment",
          desiredTop: top + 28, // below the composer card
          section: c.section,
          comment: c,
        });
      }
    }

    // 3. Active AI suggestion cards — vertically centered on the target textbox.
    for (const section of EVALUATABLE_SECTIONS) {
      const active = gutterSuggestionCommentForSection(section);
      if (!active) continue;

      const contentPath = active.contentPath ?? "narrative";
      let centerY: number | null = null;

      if (isNarrativeTargetField(contentPath)) {
        const editor = getEditor(section, contentPath);
        if (editor) {
          centerY = suggestionCenterYInEditor(
            editor,
            active.id,
            containerTop,
            active.fromPos
          );
        }
      }

      if (centerY == null) {
        const anchorKey = suggestionFieldAnchorKey(section, active.contentPath);
        const fieldEl = queryFieldAnchorKey(anchorKey);
        if (fieldEl) centerY = elementCenterY(fieldEl, containerTop);
      }

      if (centerY == null) {
        const heading = document.getElementById(section);
        if (heading) {
          const rect = heading.getBoundingClientRect();
          centerY = rect.top + rect.height / 2 - containerTop;
        }
      }

      if (centerY == null) continue;

      result.push({
        id: `suggestion:${section}`,
        type: "suggestion",
        desiredTop: centerY,
        valignCenter: true,
        section,
        comment: active,
      });
    }

    setAnchors(result.sort((a, b) => a.desiredTop - b.desiredTop));
  }, [
    comments,
    evaluations,
    gutterSuggestionCommentForSection,
    getEditor,
    editorTick,
    layoutVersion,
    canComment,
  ]);

  // Greedy non-overlap packing: each card's top is `max(desiredTop, prev.bottom + gap)`.
  // Active card stays at its desired position when possible — others shift around it.
  const packed = useMemo(() => {
    const heights = cardHeights;
    return anchors.reduce<{ items: Array<GutterAnchor & { top: number }>; prevBottom: number }>(
      (acc, a) => {
        const h = heights[a.id] ?? 80;
        const desired = a.valignCenter
          ? a.desiredTop - h / 2
          : a.desiredTop;
        const top = Math.max(desired, acc.prevBottom + CARD_GAP);
        return {
          items: [...acc.items, { ...a, top }],
          prevBottom: top + h,
        };
      },
      { items: [], prevBottom: -Infinity }
    ).items;
  }, [anchors, cardHeights]);

  // Section height overflow: after packing, compute how far cards extend
  // below each section's natural bottom and report the delta so the workspace
  // can apply minHeight to prevent overlap with the next section.
  const lastOverflowRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!onSectionOverflow) return;
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;

    const overflows: Record<string, number> = {};
    for (const section of EVALUATABLE_SECTIONS) {
      const sectionEl = document.getElementById(section);
      if (!sectionEl) continue;
      const sectionBottom =
        sectionEl.getBoundingClientRect().bottom - containerTop;
      const cardsInSection = packed.filter((c) => c.section === section);
      if (cardsInSection.length === 0) continue;
      const maxCardBottom = Math.max(
        ...cardsInSection.map((c) => c.top + (cardHeights[c.id] ?? 80))
      );
      const delta = maxCardBottom - sectionBottom;
      if (delta > 0) {
        overflows[section] = delta;
      }
    }

    // Deduplicate: skip the callback when overflow values haven't meaningfully
    // changed. Without this guard, section minHeight adjustments cause DOM
    // resizes that feed back through the ResizeObserver → anchor recomputation
    // → re-pack → overflow effect loop, hitting React's update depth limit.
    const prev = lastOverflowRef.current;
    const keys = new Set([...Object.keys(prev), ...Object.keys(overflows)]);
    let changed = false;
    for (const k of keys) {
      if (Math.abs((prev[k] ?? 0) - (overflows[k] ?? 0)) >= 2) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    lastOverflowRef.current = overflows;

    onSectionOverflow(overflows as Record<SectionType, number>);
  }, [packed, cardHeights, onSectionOverflow]);

  // Measure card heights once they render so the packer knows actual sizes.
  // Depends on anchors only — not packed (packed changes when heights update).
  useLayoutEffect(() => {
    const next = measureCardHeights(anchors, cardRefs, cardHeightsRef.current);
    if (next === cardHeightsRef.current) return;
    cardHeightsRef.current = next;
    setCardHeights(next);
  }, [anchors]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    let frame: number | null = null;
    const measure = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const next = measureCardHeights(anchors, cardRefs, cardHeightsRef.current);
        if (next === cardHeightsRef.current) return;
        cardHeightsRef.current = next;
        setCardHeights(next);
      });
    };

    const observer = new ResizeObserver(measure);
    for (const a of anchors) {
      const el = cardRefs.current[a.id];
      if (el) observer.observe(el);
    }
    measure();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [anchors]);

  const repliesByParent = useMemo(() => {
    const m = new Map<string, CommentRecord[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const arr = m.get(c.parentId) ?? [];
      arr.push(c);
      m.set(c.parentId, arr);
    }
    for (const arr of m.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return m;
  }, [comments]);

  // Auto-scroll the gutter so hovered cards are visible.
  useEffect(() => {
    if (hoveredCommentIds.length === 0) return;
    const firstId = hoveredCommentIds[0];
    const el = cardRefs.current[firstId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hoveredCommentIds]);

  const activate = (a: GutterAnchor) => {
    setActiveAnchorId(a.id);
    if (a.type === "comment" && a.comment) {
      setActiveCommentId(a.comment.id);
    } else if (a.type === "field-comment" && a.comment) {
      setActiveCommentId(a.comment.id);
    } else if (a.type === "unanchored-comment" && a.comment) {
      setActiveCommentId(a.comment.id);
    } else if (a.type === "suggestion" && a.comment) {
      setActiveCommentId(a.comment.id);
    } else {
      setActiveCommentId(null);
    }
  };

  useLayoutEffect(() => {
    const ids = new Set<string>();
    if (activeAnchorId) ids.add(activeAnchorId);
    for (const id of hoveredCommentIds) ids.add(id);
    if (ids.size === 0) {
      if (connectorLinesRef.current.length === 0) return;
      queueMicrotask(() => {
        connectorLinesRef.current = [];
        setConnectorLines([]);
      });
      return;
    }

    const container = containerRef.current;
    if (!container) {
      if (connectorLinesRef.current.length === 0) return;
      queueMicrotask(() => {
        connectorLinesRef.current = [];
        setConnectorLines([]);
      });
      return;
    }
    const containerRect = container.getBoundingClientRect();

    const lines: { id: string; y: number }[] = [];
    for (const a of packed) {
      if (!ids.has(a.id) && !(a.comment && ids.has(a.comment.id))) continue;
      if (a.type !== "comment" || !a.comment) continue;
      const cardEl = cardRefs.current[a.id];
      if (!cardEl) continue;
      const cardRect = cardEl.getBoundingClientRect();
      const y = cardRect.top - containerRect.top + cardRect.height / 2;
      lines.push({ id: a.id, y });
    }
    if (connectorLinesEqual(connectorLinesRef.current, lines)) return;
    queueMicrotask(() => {
      connectorLinesRef.current = lines;
      setConnectorLines(lines);
    });
  }, [packed, activeAnchorId, hoveredCommentIds]);

  return (
    <div ref={containerRef} className="relative w-full" aria-label="Margin notes">
      {connectorLines.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
          aria-hidden
        >
          {connectorLines.map((c) => (
            <line
              key={c.id}
              x1={-12}
              y1={c.y}
              x2={0}
              y2={c.y}
              stroke="rgb(245 158 11 / 0.5)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ))}
        </svg>
      )}
      {packed.map((a) => {
        let node: ReactNode = null;
        const isActive = activeAnchorId === a.id || activeAnchorId === a.comment?.id;

        if (a.type === "composer" && a.section) {
          node = <SectionCommentComposer section={a.section} />;
        } else if (a.type === "suggestion" && a.section) {
          node = (
            <div
              className={cn(isActive && "rounded-md ring-1 ring-violet-400/40")}
              onPointerDown={() => activate(a)}
            >
              <SectionSuggestionCard section={a.section} />
            </div>
          );
        } else if (a.type !== "composer" && a.comment) {
          const replies = repliesByParent.get(a.comment.id) ?? [];
          node = (
            <CommentCard
              root={a.comment}
              replies={replies}
              active={isActive}
              onActivate={() => activate(a)}
            />
          );
        }

        return (
          <div
            key={a.id}
            ref={(el) => {
              cardRefs.current[a.id] = el;
            }}
            className="absolute left-0 right-0 px-1"
            style={{ top: `${Math.max(0, a.top)}px` }}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}
