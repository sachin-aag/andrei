"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Loader2, Send, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useReport } from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function ReportWorkspace({ mode }: { mode: WorkspaceMode }) {
  const { report, isEvaluating, runEvaluation, refresh, currentUserId } = useReport();
  const [tab, setTab] = useState<SectionType>("define");
  const [sidebarTab, setSidebarTab] = useState<"traffic" | "comments">("traffic");
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const router = useRouter();

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
        <main className="flex-1 overflow-auto">
          <div className="max-w-[900px] mx-auto px-8 py-8 space-y-6 pb-24">
            <ReportHeader />

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as SectionType)}
              className="w-full"
            >
              <div className="sticky top-0 z-10 bg-[var(--background)] py-2 -mx-8 px-8 backdrop-blur">
                <TabsList>
                  <TabsTrigger value="define">Define</TabsTrigger>
                  <TabsTrigger value="measure">Measure</TabsTrigger>
                  <TabsTrigger value="analyze">Analyze</TabsTrigger>
                  <TabsTrigger value="improve">Improve</TabsTrigger>
                  <TabsTrigger value="control">Control</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="define"><DefineEditor /></TabsContent>
              <TabsContent value="measure"><MeasureEditor /></TabsContent>
              <TabsContent value="analyze"><AnalyzeEditor /></TabsContent>
              <TabsContent value="improve"><ImproveEditor /></TabsContent>
              <TabsContent value="control"><ControlEditor /></TabsContent>
            </Tabs>
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
              <TrafficLightSidebar activeSection={tab} />
            ) : (
              <CommentsPanel mode={mode} activeSection={tab} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
