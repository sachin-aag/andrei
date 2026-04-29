"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Download,
  Loader2,
  Send,
  CheckCircle2,
  MessageSquare,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useReport } from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import { ReportHeader } from "./report-header";
import { DefineEditor } from "./sections/define-editor";
import { MeasureEditor } from "./sections/measure-editor";
import { AnalyzeEditor } from "./sections/analyze-editor";
import { ImproveEditor } from "./sections/improve-editor";
import { ControlEditor } from "./sections/control-editor";
import { MarginGutter } from "./review-rail/margin-gutter";
import { CriteriaSheet } from "./criteria-sheet";
import { PlaceholdersPanel } from "./placeholders-panel";
import { getUser } from "@/lib/auth/mock-users";
import type { SectionType } from "@/db/schema";
import type { WorkspaceMode } from "@/providers/report-provider";

export type { WorkspaceMode };

export function ReportWorkspace({ mode }: { mode: WorkspaceMode }) {
  const {
    report,
    refresh,
    currentUserId,
    trackChangesMode,
    setTrackChangesMode,
    requestCommentFocus,
    pendingPlaceholders,
  } = useReport();
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteriaSection, setCriteriaSection] = useState<SectionType | undefined>();
  const [sectionMinHeights, setSectionMinHeights] = useState<
    Partial<Record<SectionType, number>>
  >({});
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);

  const handleOpenCriteria = useCallback((section: SectionType) => {
    setCriteriaSection(section);
    setCriteriaOpen(true);
  }, []);

  const handleSectionOverflow = useCallback(
    (overflows: Record<SectionType, number>) => {
      setSectionMinHeights((prev) => {
        // Only update if values actually changed to avoid render loops.
        const keys = Object.keys(overflows) as SectionType[];
        const prevKeys = Object.keys(prev) as SectionType[];
        if (
          keys.length === prevKeys.length &&
          keys.every((k) => Math.abs((prev[k] ?? 0) - (overflows[k] ?? 0)) < 2)
        ) {
          return prev;
        }
        return overflows;
      });
    },
    []
  );

  const manager = getUser(report.assignedManagerId ?? undefined);
  const author = getUser(report.authorId);

  const canSubmit =
    mode === "edit" &&
    report.authorId === currentUserId &&
    (report.status === "draft" || report.status === "feedback");

  const canReview =
    mode === "review" &&
    (report.status === "submitted" || report.status === "in_review");

  const warnIfPlaceholders = () => {
    const n = pendingPlaceholders.length;
    if (n > 0) {
      toast.warning(
        `${n} placeholder${n === 1 ? "" : "s"} still unfilled — submitted anyway.`
      );
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/submit`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to submit");
        return;
      }
      toast.success("Report submitted for review");
      warnIfPlaceholders();
      await refresh();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/approve`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to approve");
        return;
      }
      toast.success("Report approved");
      warnIfPlaceholders();
      await refresh();
      router.refresh();
    } finally {
      setApproving(false);
    }
  };

  const handleFeedback = async () => {
    setSendingFeedback(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/feedback`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to return feedback");
        return;
      }
      toast.success("Feedback returned to author");
      await refresh();
      router.refresh();
    } finally {
      setSendingFeedback(false);
    }
  };

  const jumpToSection = (s: SectionType) => {
    const el = mainRef.current?.querySelector(`#${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToComment = (id: string) => {
    requestCommentFocus(id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="h-16 border-b border-[var(--border)] bg-[var(--card)] px-6 flex items-center gap-4 shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ChevronLeft className="size-4" />
            Dashboard
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex flex-col leading-tight min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">
              {report.deviationNo || "Untitled"}
            </span>
            <StatusBadge status={report.status} />
          </div>
          <span className="text-xs text-[var(--muted-foreground)] truncate">
            {author?.name ?? "Unknown author"}
            {manager ? ` → ${manager.name}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-2 flex-wrap">
            <Checkbox
              id="track-changes-toggle"
              checked={trackChangesMode}
              onCheckedChange={(v) => setTrackChangesMode(v === true)}
            />
            <Label
              htmlFor="track-changes-toggle"
              className="text-sm font-normal cursor-pointer whitespace-nowrap"
            >
              Track changes
            </Label>
            {trackChangesMode && (
              <span className="text-[10px] uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200/80">
                On
              </span>
            )}
          </div>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <PlaceholdersPanel onJumpToSection={jumpToSection} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCriteriaOpen(true)}
          >
            <ListChecks className="size-4" />
            Criteria
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/reports/${report.id}/export`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="size-4" />
              Export DOCX
            </a>
          </Button>

          {canSubmit && (
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Submit for Review
            </Button>
          )}

          {canReview && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFeedback}
                disabled={sendingFeedback}
              >
                {sendingFeedback ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                Return with Feedback
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Approve
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <main
          ref={mainRef}
          className="h-full overflow-auto bg-[var(--background)]"
        >
          <div className="mx-auto px-6 py-8 pb-24 grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,720px)_360px] lg:max-w-[1180px]">
            <div className="space-y-10 min-w-0">
              <ReportHeader />
              {(["define", "measure", "analyze", "improve", "control"] as const).map((s) => {
                const Editor = {
                  define: DefineEditor,
                  measure: MeasureEditor,
                  analyze: AnalyzeEditor,
                  improve: ImproveEditor,
                  control: ControlEditor,
                }[s];
                const extra = sectionMinHeights[s];
                return (
                  <section
                    key={s}
                    id={s}
                    style={extra ? { paddingBottom: `${extra}px` } : undefined}
                  >
                    <Editor />
                  </section>
                );
              })}
            </div>
            <aside
              className="hidden lg:block relative"
              aria-label="Review margin"
            >
              <MarginGutter
                scrollRef={mainRef}
                onOpenCriteria={handleOpenCriteria}
                onSectionOverflow={handleSectionOverflow}
              />
            </aside>
          </div>
        </main>
      </div>

      <CriteriaSheet
        open={criteriaOpen}
        onOpenChange={(open) => {
          setCriteriaOpen(open);
          if (!open) setCriteriaSection(undefined);
        }}
        onJumpToSection={jumpToSection}
        onJumpToComment={jumpToComment}
        initialSection={criteriaSection}
      />
    </div>
  );
}
