"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  useReportData,
  useReportEvaluations,
  useReportSection,
} from "@/providers/report-provider";
import { useAutoSave } from "./use-auto-save";
import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";

const saveBlockedReports = new Set<string>();

export function useSectionSave<K extends keyof SectionContentMap & SectionType>(
  section: K
) {
  const { report, readOnly, trackChangesMode } = useReportData();
  const { runningSuggestionSections } = useReportEvaluations();
  const { value } = useReportSection(section);
  const suggestionInFlight = runningSuggestionSections.includes(section);
  const [saveBlocked, setSaveBlocked] = useState(false);

  const onSave = useCallback(
    async (v: SectionContentMap[K]) => {
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
        setSaveBlocked(true);
        if (!saveBlockedReports.has(report.id)) {
          saveBlockedReports.add(report.id);
          toast.error(
            "This report no longer exists. Close this tab and reopen it from the dashboard."
          );
        }
        throw new Error("Report not found");
      }
      if (res.status === 403) {
        setSaveBlocked(true);
        if (!saveBlockedReports.has(report.id)) {
          saveBlockedReports.add(report.id);
          toast.error("You can't save changes to this report.");
        }
        throw new Error("Save forbidden");
      }

      throw new Error(`Save failed (${res.status})`);
    },
    [report.id, section]
  );

  const { status, lastSavedAt, flush } = useAutoSave({
    enabled:
      (!readOnly || trackChangesMode) && !suggestionInFlight && !saveBlocked,
    value,
    onSave,
    beaconUrl: `/api/reports/${report.id}/sections/${section}`,
    serialize: (v) => JSON.stringify({ content: v }),
  });

  return { status, lastSavedAt, value, flushSave: flush };
}
