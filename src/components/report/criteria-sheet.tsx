"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  useReportComments,
  useReportEvaluations,
} from "@/providers/report-provider";
import { RunAllEvaluationButton } from "./section-status-pill";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatDateTime } from "@/lib/utils";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import {
  STATUS_COLOR,
  STATUS_TEXT_COLOR,
  type CriterionRow,
  aggregateStatus,
  effectiveStatus,
  metCount,
  rowsBySection,
} from "@/lib/ai/criteria-view";
import { SectionAccordion } from "./section-accordion";
import {
  getCommentCardPreview,
  getCommentCardTitle,
  isAiFixComment,
} from "@/lib/comments/display";
import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";

/* ------------------------------------------------------------------ */
/*  Individual criterion row                                           */
/* ------------------------------------------------------------------ */

function CriterionItem({
  row,
  busy,
}: {
  row: CriterionRow;
  busy?: boolean;
}) {
  const eff = effectiveStatus(row);

  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full mt-1.5 shrink-0 transition-opacity",
          STATUS_COLOR[eff],
          busy && "opacity-40",
        )}
      />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "leading-snug transition-opacity",
            STATUS_TEXT_COLOR[eff],
            busy && "opacity-60",
          )}
        >
          {row.criterionLabel}
        </div>
        {row.reasoning && (
          <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] leading-snug">
            {row.reasoning}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Standalone Criteria content — used inside ReportSidebar            */
/* ------------------------------------------------------------------ */

export function CriteriaPanelContent({
  onJumpToSection,
  initialSection,
}: {
  onJumpToSection?: (section: SectionType) => void;
  initialSection?: SectionType;
}) {
  const {
    evaluations,
    runningEvalSections,
  } = useReportEvaluations();
  const [openSections, setOpenSections] = useState<Set<SectionType>>(
    () => new Set(EVALUATABLE_SECTIONS),
  );
  const grouped = useMemo(() => rowsBySection(evaluations), [evaluations]);
  const [stableRowsBySection, setStableRowsBySection] = useState<
    Map<SectionType, CriterionRow[]>
  >(() => new Map(grouped));
  const containerRef = useRef<HTMLDivElement>(null);

  const displayOpenSections = useMemo(() => {
    const next = new Set(openSections);
    if (initialSection) next.add(initialSection);
    return next;
  }, [initialSection, openSections]);

  useEffect(() => {
    if (!initialSection) return;
    const frame = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(
        `[data-section="${initialSection}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialSection]);

  let nextStableRowsBySection = stableRowsBySection;
  for (const section of EVALUATABLE_SECTIONS) {
    const isRunning = runningEvalSections.includes(section);
    if (isRunning) continue;
    const rows = grouped.get(section) ?? [];
    if (nextStableRowsBySection.get(section) !== rows) {
      if (nextStableRowsBySection === stableRowsBySection) {
        nextStableRowsBySection = new Map(stableRowsBySection);
      }
      nextStableRowsBySection.set(section, rows);
    }
  }
  if (nextStableRowsBySection !== stableRowsBySection) {
    setStableRowsBySection(nextStableRowsBySection);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {EVALUATABLE_SECTIONS.map((section) => {
        const currentRows = grouped.get(section) ?? [];
        const isRunning = runningEvalSections.includes(section);
        const rows =
          (isRunning ? stableRowsBySection.get(section) : currentRows) ??
          currentRows;
        const status = aggregateStatus(rows);
        const { met, total } = metCount(rows);
        const isOpen = displayOpenSections.has(section);
        const busyLabel = isRunning ? "AI checking..." : null;
        return (
          <SectionAccordion
            key={section}
            section={section}
            count={rows.length}
            isOpen={isOpen}
            onToggle={() => {
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has(section)) next.delete(section);
                else next.add(section);
                return next;
              });
            }}
            onJumpToSection={onJumpToSection}
            statusColor={STATUS_COLOR[status]}
            trailingLabel={`${met}/${total}`}
            busy={isRunning}
            busyLabel={busyLabel ?? undefined}
            busySpinning={isRunning}
          >
            {rows.map((row) => (
              <CriterionItem key={row.criterionKey} row={row} busy={isRunning} />
            ))}
          </SectionAccordion>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Individual comment card                                            */
/* ------------------------------------------------------------------ */

function CommentCard({
  comment,
  replyCount,
  onJump,
}: {
  comment: CommentRecord;
  replyCount: number;
  onJump?: () => void;
}) {
  const { evaluations } = useReportEvaluations();
  const aiFix = isAiFixComment(comment);
  const title = getCommentCardTitle(comment, evaluations);
  const preview = getCommentCardPreview(comment);

  return (
    <button
      type="button"
      className="w-full text-left rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-amber-600/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      onClick={onJump}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <MessageSquare
          className={cn(
            "size-3 shrink-0",
            aiFix ? "text-violet-600" : "text-[var(--muted-foreground)]"
          )}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold truncate min-w-0 flex-1">
          {title}
        </span>
        {comment.status === "resolved" ? (
          <span className="text-[10px] text-green-700 ml-auto">
            Resolved
          </span>
        ) : (
          <span className="text-[10px] text-amber-800 ml-auto">
            Open
          </span>
        )}
      </div>
      {preview ? (
        <p className="text-[11px] text-[var(--muted-foreground)] mt-1 line-clamp-2 leading-snug">
          {preview}
        </p>
      ) : null}
      <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--muted-foreground)]">
        <span>{formatDateTime(comment.createdAt)}</span>
        {replyCount > 0 && <span>· {replyCount} replies</span>}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Standalone Comments content — used inside ReportSidebar            */
/* ------------------------------------------------------------------ */

export function CommentsPanelContent({
  onJumpToComment,
}: {
  onJumpToComment?: (commentId: string) => void;
}) {
  const { comments } = useReportComments();
  const [openSections, setOpenSections] = useState<Set<SectionType>>(
    () => new Set(EVALUATABLE_SECTIONS),
  );

  const rootComments = useMemo(
    () =>
      [...comments]
        .filter((c) => !c.parentId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [comments],
  );

  // Group root comments by section
  const grouped = useMemo(() => {
    const map: Record<string, CommentRecord[]> = {};
    for (const c of rootComments) {
      const key = c.section ?? "_unsectioned";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [rootComments]);

  const unsectioned = grouped["_unsectioned"] ?? [];

  if (rootComments.length === 0) {
    return (
      <div className="text-xs text-[var(--muted-foreground)] italic text-center py-8">
        No comments yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {EVALUATABLE_SECTIONS.map((section) => {
        const list = grouped[section] ?? [];
        return (
          <SectionAccordion
            key={section}
            section={section}
            count={list.length}
            isOpen={openSections.has(section)}
            onToggle={() => {
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has(section)) next.delete(section);
                else next.add(section);
                return next;
              });
            }}
          >
            <div className="space-y-1.5">
              {list.map((c) => {
                const replies = comments.filter((r) => r.parentId === c.id).length;
                return (
                  <CommentCard
                    key={c.id}
                    comment={c}
                    replyCount={replies}
                    onJump={() => onJumpToComment?.(c.id)}
                  />
                );
              })}
            </div>
          </SectionAccordion>
        );
      })}
      {unsectioned.length > 0 && (
        <div className="space-y-1.5 mt-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold px-1">
            General
          </p>
          {unsectioned.map((c) => {
            const replies = comments.filter((r) => r.parentId === c.id).length;
            return (
              <CommentCard
                key={c.id}
                comment={c}
                replyCount={replies}
                onJump={() => onJumpToComment?.(c.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Original Sheet wrapper — kept for backwards compat                 */
/* ------------------------------------------------------------------ */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToSection?: (section: SectionType) => void;
  onJumpToComment?: (commentId: string) => void;
  /** When set, auto-scroll to this section on open. */
  initialSection?: SectionType;
};

export function CriteriaSheet({
  open,
  onOpenChange,
  onJumpToSection,
  onJumpToComment,
  initialSection,
}: Props) {
  const { comments } = useReportComments();

  const rootComments = useMemo(
    () => comments.filter((c) => !c.parentId),
    [comments],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg w-full"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle>Review overview</SheetTitle>
              <SheetDescription>
                Quick scan of AI criteria and all comment threads.
              </SheetDescription>
            </div>
            <RunAllEvaluationButton layout="inline" className="h-7 text-xs max-w-[11rem]" />
          </div>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-hidden p-3">
          <Tabs defaultValue="criteria" className="h-full flex flex-col">
            <TabsList>
              <TabsTrigger value="criteria">Criteria</TabsTrigger>
              <TabsTrigger value="comments">
                Comments ({rootComments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="criteria"
              className="flex-1 min-h-0 overflow-y-auto mt-3"
            >
              <CriteriaPanelContent
                onJumpToSection={
                  onJumpToSection
                    ? (s) => {
                        onOpenChange(false);
                        onJumpToSection(s);
                      }
                    : undefined
                }
                initialSection={open ? initialSection : undefined}
              />
            </TabsContent>

            <TabsContent
              value="comments"
              className="flex-1 min-h-0 overflow-y-auto mt-3"
            >
              <CommentsPanelContent
                onJumpToComment={
                  onJumpToComment
                    ? (id) => {
                        onOpenChange(false);
                        onJumpToComment(id);
                      }
                    : undefined
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
