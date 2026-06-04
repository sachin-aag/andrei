"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ImproveAiUploadButton,
  type ImproveAiReportOption,
} from "@/components/improve-ai/improve-ai-upload-button";

export function ImproveAiListHeader({
  sessionCount,
  userName,
  userEmail,
  reports,
}: {
  sessionCount: number;
  userName: string;
  userEmail: string;
  reports: ImproveAiReportOption[];
}) {
  return (
    <header className="shrink-0 border-b border-[var(--border)] px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="size-3.5" />
            Reports
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Improve AI</h1>
          <p className="text-sm text-[var(--muted-foreground)] max-w-2xl">
            Upload a report or send an existing report for AI criteria evaluation,
            then give feedback to help refine future evaluations. You only see
            sessions you submitted ({sessionCount}).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <ImproveAiUploadButton reports={reports} />
          <p className="text-xs text-[var(--muted-foreground)] text-right">
            Signed in as{" "}
            <span className="font-medium text-[var(--foreground)]">{userName}</span>{" "}
            ({userEmail})
          </p>
        </div>
      </div>
    </header>
  );
}
