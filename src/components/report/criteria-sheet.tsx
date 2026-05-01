"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles, Check, MessageSquare } from "lucide-react";
import {
  useReportComments,
  useReportEvaluations,
} from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
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
  aggregateStatus,
  effectiveStatus,
  metCount,
  rowsBySection,
} from "@/lib/ai/criteria-view";
import { SECTION_LABELS } from "@/types/sections";
import { getUser } from "@/lib/auth/mock-users";
import type { SectionType } from "@/db/schema";

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
  const { evaluations, runEvaluation, isEvaluating } = useReportEvaluations();
  const [openSections, setOpenSections] = useState<Set<SectionType>>(
    () => new Set(EVALUATABLE_SECTIONS)
  );
  const grouped = useMemo(() => rowsBySection(evaluations), [evaluations]);
  const criteriaContainerRef = useRef<HTMLDivElement>(null);

  /** When the sheet opens with a target section, force that row expanded without a state-sync effect. */
  const displayOpenSections = useMemo(() => {
    const next = new Set(openSections);
    if (open && initialSection) next.add(initialSection);
    return next;
  }, [open, initialSection, openSections]);

  // When opened from an overflow card, scroll that section into view after layout.
  useEffect(() => {
    if (!open || !initialSection) return;
    // Wait a tick for the DOM to update before scrolling.
    const frame = requestAnimationFrame(() => {
      const el = criteriaContainerRef.current?.querySelector(
        `[data-section="${initialSection}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initialSection]);

  const rootComments = useMemo(
    () =>
      [...comments]
        .filter((c) => !c.parentId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [comments]
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
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => runEvaluation(undefined, { reason: "manual" })}
              disabled={isEvaluating}
            >
              {isEvaluating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Run AI check
            </Button>
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
              ref={criteriaContainerRef}
              value="criteria"
              className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2"
            >
              {EVALUATABLE_SECTIONS.map((section) => {
                const rows = grouped.get(section) ?? [];
                const status = aggregateStatus(rows);
                const { met, total } = metCount(rows);
                const isOpen = displayOpenSections.has(section);
                return (
                  <div
                    key={section}
                    data-section={section}
                    className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden"
                  >
                    <div className="flex items-center gap-1 hover:bg-[var(--secondary)]">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`criteria-section-${section}`}
                        className="min-w-0 flex-1 flex items-center gap-2 px-3 py-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                        onClick={() => {
                          setOpenSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(section)) next.delete(section);
                            else next.add(section);
                            return next;
                          });
                        }}
                      >
                        {isOpen ? (
                          <ChevronDown
                            className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronRight
                            className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
                            aria-hidden="true"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2.5 rounded-full shrink-0",
                            STATUS_COLOR[status]
                          )}
                        />
                        <span className="text-sm font-semibold flex-1 truncate">
                          {SECTION_LABELS[section] ?? section}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {met}/{total}
                        </span>
                      </button>
                      {onJumpToSection && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mr-2 h-6 px-2 text-[10px]"
                          onClick={() => {
                            onOpenChange(false);
                            onJumpToSection(section);
                          }}
                        >
                          Jump
                        </Button>
                      )}
                    </div>

                    {isOpen && (
                      <div
                        id={`criteria-section-${section}`}
                        className="border-t border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 space-y-1.5"
                      >
                        {rows.map((row) => {
                          const eff = effectiveStatus(row);
                          return (
                            <div
                              key={row.criterionKey}
                              className="flex items-start gap-2 text-xs"
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "size-1.5 rounded-full mt-1.5 shrink-0",
                                  STATUS_COLOR[eff]
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div
                                  className={cn(
                                    "leading-snug",
                                    row.bypassed &&
                                      "line-through text-[var(--muted-foreground)]",
                                    !row.bypassed && STATUS_TEXT_COLOR[eff]
                                  )}
                                >
                                  {row.criterionLabel}
                                </div>
                                {row.reasoning && (
                                  <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] leading-snug">
                                    {row.reasoning}
                                  </div>
                                )}
                                {row.fixApplied && (
                                  <div className="mt-1 text-[10px] text-green-700 flex items-center gap-1">
                                    <Check className="size-3" aria-hidden="true" /> Fix applied
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent
              value="comments"
              className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2"
            >
              {rootComments.length === 0 ? (
                <div className="text-xs text-[var(--muted-foreground)] italic text-center py-8">
                  No comments yet.
                </div>
              ) : (
                rootComments.map((c) => {
                  const author = getUser(c.authorId);
                  const replies = comments.filter((r) => r.parentId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-amber-600/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                      onClick={() => {
                        onOpenChange(false);
                        onJumpToComment?.(c.id);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <MessageSquare
                          className="size-3 text-[var(--muted-foreground)]"
                          aria-hidden="true"
                        />
                        <span className="text-xs font-semibold truncate">
                          {author?.name ?? "Unknown"}
                        </span>
                        {c.section && (
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">
                            {SECTION_LABELS[c.section] ?? c.section}
                          </span>
                        )}
                        {c.status === "resolved" ? (
                          <span className="text-[10px] text-green-700 ml-auto">
                            Resolved
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-800 ml-auto">
                            Open
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground)] mt-1 line-clamp-2">
                        {c.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--muted-foreground)]">
                        <span>{formatDateTime(c.createdAt)}</span>
                        {replies > 0 && <span>· {replies} replies</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
