"use client";

import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
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
import {
  countOpenAiSuggestions,
  openAiSuggestionIds,
  sectionOrderWithOpenSuggestions,
} from "@/lib/ai/suggestion-gating";
import { getDocumentType, suggestionApplyModeFor } from "@/lib/document-types";
import {
  acceptAllSuggestionsInReport,
  dismissAllSuggestionsInReport,
  formatBulkApplyToast,
  formatBulkDismissToast,
  shouldShowSuggestionBulkActions,
} from "@/lib/suggestions/bulk-suggestions";
import {
  applyIdentityPatchToReport,
  identityCurrentFromReport,
} from "@/lib/suggestions/identity-suggestion";
import type { IdentityApplyPatch } from "@/lib/suggestions/accept-suggestion";
import { captureEvent } from "@/lib/analytics/events";
import type { SectionType } from "@/db/schema";

/**
 * Document-wide bulk actions. Scoped to the whole report on purpose — the
 * per-suggestion Apply / Dismiss on the gutter card stay section-scoped.
 */
export function ReportBulkSuggestionActions() {
  const {
    report,
    setReport,
    readOnly,
    currentUserId,
    refresh,
    closeSuggestionComments,
    releaseSuggestionComments,
    markSectionPersisted,
  } = useReportData();
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

  const sectionOrder = useMemo(
    () =>
      sectionOrderWithOpenSuggestions(
        suggestionCardSectionKeys(report.documentType),
        comments
      ),
    [report.documentType, comments]
  );

  const openTotal = countOpenAiSuggestions(comments);

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
      documentType: report.documentType,
      sectionContentFor: (section: SectionType) =>
        sections[section] as Record<string, unknown> | undefined,
      identityCurrent: identityCurrentFromReport(report),
      onIdentitySettled: (next: IdentityApplyPatch) => {
        flushSync(() => {
          setReport((prev) => applyIdentityPatchToReport(prev, next));
        });
      },
      onSectionStart: (section: SectionType, firstCommentId: string) => {
        // Pauses that section's auto-save. Apply-all uses "bulk" (keep insert
        // text, hide deletes instantly). Dismiss-all uses "dismiss" so the
        // original wording stays instead of the proposed insert.
        beginSuggestionApplyTransition(section, firstCommentId, holdMode);
      },
      onSectionSettled: (section: SectionType, next: Record<string, unknown>) => {
        flushSync(() => {
          replaceSection(section, next as unknown);
        });
      },
    }),
    [
      report,
      sectionOrder,
      comments,
      evaluations,
      sections,
      replaceSection,
      setReport,
      beginSuggestionApplyTransition,
    ]
  );

  const handleAcceptAll = useCallback(async () => {
    if (running || !canResolve) return;
    setRunning("accept");
    const openIds = openAiSuggestionIds(comments);
    closeSuggestionComments(openIds);
    try {
      const result = await acceptAllSuggestionsInReport({
        ...buildBulkArgs("bulk"),
        applyMode: suggestionApplyModeFor(getDocumentType(report.documentType)),
      });

      releaseSuggestionComments([...result.skippedIds, ...result.failedIds]);
      for (const section of result.changedSections) {
        markSectionPersisted(section);
      }
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
        result.skippedIds.length,
        result.dismissedIds.length
      );
      if (result.failedIds.length > 0) {
        toast.error(
          `${message}. Could not save section. Please try again.`
        );
        await refresh();
      } else if (result.appliedIds.length === 0) {
        toast.error(message);
      } else {
        toast.success(message);
      }
    } catch (err) {
      console.error(err);
      releaseSuggestionComments(openIds);
      toast.error("Could not apply suggestions");
      await refresh();
    } finally {
      releaseBulkHolds();
      setRunning(null);
    }
  }, [
    running,
    canResolve,
    comments,
    closeSuggestionComments,
    releaseSuggestionComments,
    markSectionPersisted,
    buildBulkArgs,
    report.documentType,
    setComments,
    refresh,
    releaseBulkHolds,
  ]);

  const handleDismissAll = useCallback(async () => {
    if (running || !canResolve) return;
    setRunning("dismiss");
    const openIds = openAiSuggestionIds(comments);
    closeSuggestionComments(openIds);
    try {
      const result = await dismissAllSuggestionsInReport(buildBulkArgs("dismiss"));

      releaseSuggestionComments(result.failedIds);
      for (const section of result.changedSections) {
        markSectionPersisted(section);
      }
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
      releaseSuggestionComments(openIds);
      toast.error("Could not dismiss suggestions");
      await refresh();
    } finally {
      releaseBulkHolds();
      setRunning(null);
    }
  }, [
    running,
    canResolve,
    comments,
    closeSuggestionComments,
    releaseSuggestionComments,
    markSectionPersisted,
    buildBulkArgs,
    setComments,
    refresh,
    releaseBulkHolds,
  ]);

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
