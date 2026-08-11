"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  useGenericReportSection,
  useReportData,
  useReportEvaluations,
} from "@/providers/report-provider";
import { useAutoSave } from "./use-auto-save";

/**
 * Autosave hook for non-investigation document sections (string section keys).
 */
export function useGenericSectionSave(section: string) {
  const { report, readOnly, trackChangesMode, registerSectionFlush } =
    useReportData();
  const { suggestionApplyTransition } = useReportEvaluations();
  const { value } = useGenericReportSection(section);
  const applyInFlight = !!suggestionApplyTransition?.[section];

  const onSave = useCallback(
    async (v: unknown) => {
      const res = await fetch(
        `/api/reports/${report.id}/sections/${section}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: v }),
        }
      );
      if (res.ok) return;
      if (res.status === 404) {
        toast.error(
          "This report no longer exists. Close this tab and reopen it from the dashboard."
        );
        throw new Error("Report not found");
      }
      if (res.status === 403) {
        toast.error("You can't save changes to this report.");
        throw new Error("Save forbidden");
      }
      throw new Error(`Save failed (${res.status})`);
    },
    [report.id, section]
  );

  const { status, lastSavedAt, flush } = useAutoSave({
    enabled:
      ((!readOnly &&
        report.status !== "submitted" &&
        report.status !== "approved") ||
        trackChangesMode) &&
      !applyInFlight,
    value,
    onSave,
    beaconUrl: `/api/reports/${report.id}/sections/${section}`,
    serialize: (v) => JSON.stringify({ content: v }),
  });

  // registerSectionFlush expects investigation keys; register for DV too when supported
  void registerSectionFlush;

  return { status, lastSavedAt, value, flushSave: flush };
}
