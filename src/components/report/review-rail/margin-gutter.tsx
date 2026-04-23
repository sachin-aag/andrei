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
import { AiSuggestionCard } from "./ai-suggestion-card";
import { SectionCommentComposer } from "./section-comment-composer";
import { findAnchorRangeInDoc } from "@/lib/tiptap/find-anchor";
import { activeSuggestions } from "@/lib/ai/criteria-view";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { getUser } from "@/lib/auth/mock-users";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

export type GutterAnchor = {
  /** Stable id: comment id, `ai:<evaluationId>`, `composer:<section>`, or `unanchored:<commentId>`. */
  id: string;
  type: "comment" | "ai" | "composer" | "unanchored-comment";
  desiredTop: number;
  section?: SectionType;
  comment?: CommentRecord;
  evaluation?: EvaluationRecord;
  /** True when an AI anchor text wasn't found in the live doc. */
  anchorMissing?: boolean;
};

const CARD_GAP = 8;

type Props = {
  scrollRef: RefObject<HTMLElement | null>;
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
export function MarginGutter({ scrollRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    comments,
    evaluations,
    getEditor,
    editorTick,
    activeAnchorId,
    setActiveAnchorId,
    setActiveCommentId,
    workspaceMode,
    report,
    currentUserId,
  } = useReport();
  const [tick, setTick] = useState(0);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isManagerReview =
    workspaceMode === "review" &&
    getUser(currentUserId)?.role === "manager" &&
    (report.status === "submitted" || report.status === "in_review");

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
    if (isManagerReview) {
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

    // 3. AI suggestions — anchor in the live doc and slot in.
    for (const ev of activeSuggestions(evaluations)) {
      const section = ev.section as SectionType;
      const editor = getEditor(section, "narrative");
      let top: number | null = null;
      let anchorMissing = false;

      if (editor && ev.suggestedFix?.anchorText?.trim()) {
        const range = findAnchorRangeInDoc(
          editor.view.state.doc,
          ev.suggestedFix.anchorText
        );
        if (range) {
          try {
            const coords = editor.view.coordsAtPos(range.from);
            top = coords.top - containerTop;
          } catch {
            anchorMissing = true;
          }
        } else {
          anchorMissing = true;
        }
      } else {
        anchorMissing = true;
      }

      if (top == null) {
        const heading = document.getElementById(section);
        if (!heading) continue;
        top = heading.getBoundingClientRect().top - containerTop + 56;
      }

      result.push({
        id: `ai:${ev.id}`,
        type: "ai",
        desiredTop: top,
        section,
        evaluation: ev,
        anchorMissing,
      });
    }

    return result.sort((a, b) => a.desiredTop - b.desiredTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    comments,
    evaluations,
    getEditor,
    editorTick,
    tick,
    isManagerReview,
    containerRef,
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

  return (
    <div ref={containerRef} className="relative w-full" aria-label="Margin notes">
      {packed.map((a) => {
        let node: ReactNode = null;
        const isActive = activeAnchorId === a.id;

        if (a.type === "composer" && a.section) {
          node = <SectionCommentComposer section={a.section} />;
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
        } else if (a.type === "ai" && a.evaluation) {
          node = (
            <AiSuggestionCard
              evaluation={a.evaluation}
              active={isActive}
              anchorMissing={!!a.anchorMissing}
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
