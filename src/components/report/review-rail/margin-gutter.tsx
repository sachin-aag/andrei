"use client";

import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useReport } from "@/providers/report-provider";
import { CommentCard } from "./comment-card";
import { OverflowSummaryCard } from "./overflow-summary-card";
import { SectionCommentComposer } from "./section-comment-composer";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { getUser } from "@/lib/auth/mock-users";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

export type GutterAnchor = {
  /** Stable id: comment id, `composer:<section>`, `unanchored:<commentId>`, or `overflow:<section>`. */
  id: string;
  type: "comment" | "composer" | "unanchored-comment" | "overflow-summary";
  desiredTop: number;
  section?: SectionType;
  comment?: CommentRecord;
  /** Only set for overflow-summary anchors. */
  overflowCount?: number;
};

const CARD_GAP = 8;

type Props = {
  scrollRef: RefObject<HTMLElement | null>;
  onOpenCriteria?: (section: SectionType) => void;
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
export function MarginGutter({ scrollRef, onOpenCriteria, onSectionOverflow }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    comments,
    getEditor,
    editorTick,
    activeAnchorId,
    setActiveAnchorId,
    setActiveCommentId,
    hoveredCommentIds,
    workspaceMode,
    report,
    currentUserId,
    overflowCounts,
  } = useReport();
  const [tick, setTick] = useState(0);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isManager = getUser(currentUserId)?.role === "manager";
  const isAuthor = currentUserId === report.authorId;
  const canComment =
    (isManager && workspaceMode === "review" && (report.status === "submitted" || report.status === "in_review")) ||
    (isAuthor && (report.status === "draft" || report.status === "submitted" || report.status === "in_review"));

  // Recompute on scroll/resize so cards stay glued to anchors as the user scrolls.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onScroll = () => setTick((n) => n + 1);
    const onResize = () => setTick((n) => n + 1);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [scrollRef]);

  const anchors = useMemo<GutterAnchor[]>(() => {
    void tick; // re-run on scroll/resize
    void editorTick; // re-run when editors mutate
    const container = containerRef.current;
    if (!container) return [];
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

    // 2. Comments — anchored ones use editor coords; unanchored go to section header.
    for (const c of comments) {
      if (c.parentId) continue;
      const isAnchored =
        c.section &&
        c.contentPath &&
        c.fromPos != null &&
        c.toPos != null;

      if (isAnchored) {
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

    // AI suggestions used to be a separate gutter card slot. They now live as
    // ai_fix comments and are handled by the comment loop above — no extra
    // slot needed.

    // 3. Overflow summary cards for sections with capped AI comments.
    for (const section of EVALUATABLE_SECTIONS) {
      const count = overflowCounts[section as SectionType];
      if (!count || count <= 0) continue;
      // Find the last comment anchor in this section to place the overflow card below it.
      const sectionAnchors = result.filter((a) => a.section === section && a.type !== "composer");
      const lastAnchor = sectionAnchors[sectionAnchors.length - 1];
      const baseTop = lastAnchor ? lastAnchor.desiredTop + 60 : 0;
      // Fallback: use section heading if no comments at all.
      const heading = document.getElementById(section);
      const fallbackTop = heading
        ? heading.getBoundingClientRect().top - containerTop + 60
        : baseTop;
      result.push({
        id: `overflow:${section}`,
        type: "overflow-summary",
        desiredTop: lastAnchor ? baseTop : fallbackTop,
        section: section as SectionType,
        overflowCount: count,
      });
    }

    return result.sort((a, b) => a.desiredTop - b.desiredTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    comments,
    getEditor,
    editorTick,
    tick,
    canComment,
    containerRef,
    overflowCounts,
  ]);

  // Greedy non-overlap packing: each card's top is `max(desiredTop, prev.bottom + gap)`.
  // Active card stays at its desired position when possible — others shift around it.
  const packed = useMemo(() => {
    const heights = cardHeights;
    let prevBottom = -Infinity;
    return anchors.map((a) => {
      const desired = a.desiredTop;
      const top = Math.max(desired, prevBottom + CARD_GAP);
      const h = heights[a.id] ?? 80;
      prevBottom = top + h;
      return { ...a, top };
    });
  }, [anchors, cardHeights]);

  // Section height overflow: after packing, compute how far cards extend
  // below each section's natural bottom and report the delta so the workspace
  // can apply minHeight to prevent overlap with the next section.
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
    onSectionOverflow(overflows as Record<SectionType, number>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packed, cardHeights, onSectionOverflow]);

  // Measure card heights once they render so the packer knows actual sizes.
  useLayoutEffect(() => {
    let changed = false;
    const next: Record<string, number> = { ...cardHeights };
    for (const a of anchors) {
      const el = cardRefs.current[a.id];
      if (!el) continue;
      const h = el.getBoundingClientRect().height;
      if (Math.abs((next[a.id] ?? 0) - h) > 1) {
        next[a.id] = h;
        changed = true;
      }
    }
    if (changed) setCardHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packed, anchors.length]);

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
    } else if (a.type === "unanchored-comment" && a.comment) {
      setActiveCommentId(a.comment.id);
    } else {
      setActiveCommentId(null);
    }
  };

  // Compute connector line positions for active/hovered comment(s).
  const connectorAnchors = useMemo(() => {
    const ids = new Set<string>();
    if (activeAnchorId) ids.add(activeAnchorId);
    for (const id of hoveredCommentIds) ids.add(id);
    if (ids.size === 0) return [];

    const container = containerRef.current;
    if (!container) return [];
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
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packed, activeAnchorId, hoveredCommentIds, tick]);

  return (
    <div ref={containerRef} className="relative w-full" aria-label="Margin notes">
      {connectorAnchors.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
          aria-hidden
        >
          {connectorAnchors.map((c) => (
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
        const isActive = activeAnchorId === a.id;

        if (a.type === "composer" && a.section) {
          node = <SectionCommentComposer section={a.section} />;
        } else if (a.type === "overflow-summary" && a.section && a.overflowCount) {
          node = (
            <OverflowSummaryCard
              count={a.overflowCount}
              onClick={() => onOpenCriteria?.(a.section!)}
            />
          );
        } else if (
          (a.type === "comment" || a.type === "unanchored-comment") &&
          a.comment
        ) {
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
            className="absolute left-0 right-0 px-1 transition-all duration-150"
            style={{ top: `${Math.max(0, a.top)}px` }}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}
