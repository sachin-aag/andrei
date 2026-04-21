"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Loader2, Send, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useReport } from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import { ReportHeader } from "./report-header";
import { DefineEditor } from "./sections/define-editor";
import { MeasureEditor } from "./sections/measure-editor";
import { AnalyzeEditor } from "./sections/analyze-editor";
import { ImproveEditor } from "./sections/improve-editor";
import { ControlEditor } from "./sections/control-editor";
import { TrafficLightSidebar } from "./traffic-light-sidebar";
import { CommentsPanel } from "./comments-panel";
import { getUser } from "@/lib/auth/mock-users";
import type { SectionType } from "@/db/schema";

export type WorkspaceMode = "edit" | "review";

const DMAIC_SECTIONS: SectionType[] = ["define", "measure", "analyze", "improve", "control"];

export function ReportWorkspace({ mode }: { mode: WorkspaceMode }) {
  const { report, isEvaluating, runEvaluation, refresh, currentUserId } = useReport();
  const [activeSection, setActiveSection] = useState<SectionType>("define");
  const [sidebarTab, setSidebarTab] = useState<"traffic" | "comments">("traffic");
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);

  // Scroll-spy: track which section is currently in view
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id as SectionType);
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -60% 0px",
        threshold: 0,
      }
    );

    for (const section of DMAIC_SECTIONS) {
      const el = container.querySelector(`#${section}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const manager = useMemo(
    () => getUser(report.assignedManagerId ?? undefined),
    [report.assignedManagerId]
  );
  const author = useMemo(() => getUser(report.authorId), [report.authorId]);

  const canSubmit =
    mode === "edit" &&
    report.authorId === currentUserId &&
    (report.status === "draft" || report.status === "feedback");

  const canReview =
    mode === "review" &&
    (report.status === "submitted" || report.status === "in_review");

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/submit`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to submit");
        return;
      }
      toast.success("Report submitted for review");
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
        <div className="ml-auto flex items-center gap-2">
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

      <div className="flex-1 flex overflow-hidden">
        <main ref={mainRef} className="flex-1 overflow-auto">
          <div className="max-w-[900px] mx-auto px-8 py-8 space-y-10 pb-24">
            <ReportHeader />

            <section id="define"><DefineEditor /></section>
            <section id="measure"><MeasureEditor /></section>
            <section id="analyze"><AnalyzeEditor /></section>
            <section id="improve"><ImproveEditor /></section>
            <section id="control"><ControlEditor /></section>
          </div>
        </main>

        <aside className="w-[380px] shrink-0 border-l border-[var(--border)] bg-[var(--card)] flex flex-col">
          <div className="shrink-0 h-12 px-4 flex items-center border-b border-[var(--border)]">
            <div className="flex gap-1 bg-[var(--secondary)] p-1 rounded-md text-xs">
              <button
                className={`px-3 py-1 rounded ${
                  sidebarTab === "traffic"
                    ? "bg-[var(--brand-600)] text-white"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setSidebarTab("traffic")}
              >
                Traffic Light
              </button>
              <button
                className={`px-3 py-1 rounded ${
                  sidebarTab === "comments"
                    ? "bg-[var(--brand-600)] text-white"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setSidebarTab("comments")}
              >
                Comments
              </button>
            </div>
            <div className="ml-auto">
              {sidebarTab === "traffic" && (
                <Button
                  size="sm"
                  onClick={() => runEvaluation()}
                  disabled={isEvaluating}
                >
                  {isEvaluating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Run AI Check
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {sidebarTab === "traffic" ? (
              <TrafficLightSidebar activeSection={activeSection} onSectionClick={(s) => {
                const el = mainRef.current?.querySelector(`#${s}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }} />
            ) : (
              <CommentsPanel mode={mode} activeSection={activeSection} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
