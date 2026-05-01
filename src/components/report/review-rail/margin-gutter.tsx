"use client";

import {
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
export function MarginGutter({ onOpenCriteria, onSectionOverflow }: Props) {
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
  const { overflowCounts } = useReportEvaluations();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [anchors, setAnchors] = useState<GutterAnchor[]>([]);
  const [connectorLines, setConnectorLines] = useState<{ id: string; y: number }[]>([]);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      const sectionAnchors = result.filter((a) => a.section === section && a.type !== "composer");
      const lastAnchor = sectionAnchors[sectionAnchors.length - 1];
      const baseTop = lastAnchor ? lastAnchor.desiredTop + 60 : 0;
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

    setAnchors(result.sort((a, b) => a.desiredTop - b.desiredTop));
  }, [
    comments,
    getEditor,
    editorTick,
    layoutVersion,
    canComment,
    overflowCounts,
  ]);

  // Greedy non-overlap packing: each card's top is `max(desiredTop, prev.bottom + gap)`.
  // Active card stays at its desired position when possible — others shift around it.
  const packed = useMemo(() => {
    const heights = cardHeights;
    return anchors.reduce<{ items: Array<GutterAnchor & { top: number }>; prevBottom: number }>(
      (acc, a) => {
        const desired = a.desiredTop;
        const top = Math.max(desired, acc.prevBottom + CARD_GAP);
        const h = heights[a.id] ?? 80;
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
  }, [packed, cardHeights, onSectionOverflow]);

  // Measure card heights once they render so the packer knows actual sizes.
  useLayoutEffect(() => {
    setCardHeights((prev) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const a of anchors) {
        const el = cardRefs.current[a.id];
        const h = el?.getBoundingClientRect().height ?? prev[a.id];
        if (h == null) continue;
        next[a.id] = h;
        if (Math.abs((prev[a.id] ?? 0) - h) > 1) {
          changed = true;
        }
      }

      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
  }, [packed, anchors]);

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

  useLayoutEffect(() => {
    const ids = new Set<string>();
    if (activeAnchorId) ids.add(activeAnchorId);
    for (const id of hoveredCommentIds) ids.add(id);
    if (ids.size === 0) {
      queueMicrotask(() => {
        setConnectorLines([]);
      });
      return;
    }

    const container = containerRef.current;
    if (!container) {
      queueMicrotask(() => {
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
    queueMicrotask(() => {
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
