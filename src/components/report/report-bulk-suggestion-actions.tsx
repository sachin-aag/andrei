"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportSections,
} from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { suggestionCardSectionKeys } from "@/lib/ai/criteria-view";
import { countOpenAiSuggestions } from "@/lib/ai/suggestion-gating";
import { getDocumentType, suggestionApplyModeFor } from "@/lib/document-types";
import {
  acceptAllSuggestionsInReport,
  dismissAllSuggestionsInReport,
  formatBulkApplyToast,
  formatBulkDismissToast,
  shouldShowSuggestionBulkActions,
} from "@/lib/suggestions/bulk-suggestions";
import { captureEvent } from "@/lib/analytics/events";
import type { SectionType } from "@/db/schema";

/**
 * Document-wide bulk actions. Scoped to the whole report on purpose — the
 * per-suggestion Apply / Dismiss on the gutter card stay section-scoped.
 */
export function ReportBulkSuggestionActions() {
  const { report, readOnly, currentUserId, refresh } = useReportData();
  const { getUser } = useUserDirectory();
  const { comments, setComments } = useReportComments();
  const { sections, replaceSection } = useReportSections();
  const {
    evaluations,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  } = useReportEvaluations();
  const [running, setRunning] = useState<"accept" | "dismiss" | null>(null);

  const canResolve =
    !readOnly &&
    (currentUserId === report.authorId ||
      getUser(currentUserId)?.role === "manager");

  const openTotal = countOpenAiSuggestions(comments);

  const sectionOrder = useMemo(
    () => suggestionCardSectionKeys(report.documentType),
    [report.documentType]
  );

  const releaseBulkHolds = useCallback(() => {
    // Release after comments are updated so TipTap does not re-inject a
    // still-open card onto already-applied text.
    for (const section of sectionOrder) {
      endSuggestionApplyTransition(section);
    }
  }, [sectionOrder, endSuggestionApplyTransition]);

  const buildBulkArgs = useCallback(
    (holdMode: "bulk" | "dismiss") => ({
      reportId: report.id,
      sectionOrder,
      comments,
      evaluations,
      sectionContentFor: (section: SectionType) =>
        sections[section] as Record<string, unknown> | undefined,
      onSectionStart: (section: SectionType, firstCommentId: string) => {
        // Pauses that section's auto-save. Apply-all uses "bulk" (keep insert
        // text, hide deletes instantly). Dismiss-all uses "dismiss" so the
        // original wording stays instead of the proposed insert.
        beginSuggestionApplyTransition(section, firstCommentId, holdMode);
      },
      onSectionSettled: (section: SectionType, next: Record<string, unknown>) => {
        replaceSection(section, next as unknown);
      },
    }),
    [
      report.id,
      sectionOrder,
      comments,
      evaluations,
      sections,
      replaceSection,
      beginSuggestionApplyTransition,
    ]
  );

  const handleAcceptAll = useCallback(async () => {
    if (running || !canResolve) return;
    setRunning("accept");
    try {
      const result = await acceptAllSuggestionsInReport({
        ...buildBulkArgs("bulk"),
        applyMode: suggestionApplyModeFor(getDocumentType(report.documentType)),
      });

      const applied = new Set(result.appliedIds);
      const superseded = new Set(result.dismissedIds);
      setComments((prev) =>
        prev
          .map((c) =>
            applied.has(c.id) ? { ...c, status: "resolved" as const } : c
          )
          .filter((c) => !superseded.has(c.id))
      );
      for (const id of result.appliedIds) {
        captureEvent("ai_suggestion_accepted", { suggestionId: id, bulk: true });
      }

      const message = formatBulkApplyToast(
        result.appliedIds.length,
        result.skippedIds.length
      );
      if (result.failedIds.length > 0) {
        toast.error(`${message}. Some sections stopped after a save error.`);
        await refresh();
      } else if (result.appliedIds.length === 0) {
        toast.error(message);
      } else {
        toast.success(message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not apply suggestions");
      await refresh();
    } finally {
      releaseBulkHolds();
      setRunning(null);
    }
  }, [
    running,
    canResolve,
    buildBulkArgs,
    report.documentType,
    setComments,
    refresh,
    releaseBulkHolds,
  ]);

  const handleDismissAll = useCallback(async () => {
    if (running || !canResolve) return;
    setRunning("dismiss");
    try {
      const result = await dismissAllSuggestionsInReport(buildBulkArgs("dismiss"));

      const dismissed = new Set(result.appliedIds);
      setComments((prev) => prev.filter((c) => !dismissed.has(c.id)));
      for (const id of result.appliedIds) {
        captureEvent("ai_suggestion_dismissed", { suggestionId: id, bulk: true });
      }

      const message = formatBulkDismissToast(
        result.appliedIds.length,
        result.failedIds.length
      );
      if (result.appliedIds.length === 0 || result.failedIds.length > 0) {
        toast.error(message);
        await refresh();
      } else {
        toast.success(message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not dismiss suggestions");
      await refresh();
    } finally {
      releaseBulkHolds();
      setRunning(null);
    }
  }, [running, canResolve, buildBulkArgs, setComments, refresh, releaseBulkHolds]);

  if (!canResolve) return null;
  if (!shouldShowSuggestionBulkActions(openTotal)) return null;

  const busy = running !== null;

  return (
    <div className="flex items-center gap-2" data-testid="report-bulk-suggestion-actions">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        title={`Apply all ${openTotal} open suggestions across the document`}
        onClick={() => {
          void handleAcceptAll();
        }}
      >
        {running === "accept" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCheck className="size-4 shrink-0" aria-hidden="true" />
        )}
        Apply all {openTotal}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        title={`Dismiss all ${openTotal} open suggestions across the document`}
        onClick={() => {
          void handleDismissAll();
        }}
      >
        {running === "dismiss" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <X className="size-4 shrink-0" aria-hidden="true" />
        )}
        Dismiss all
      </Button>
    </div>
  );
}
