"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useAutoSave } from "@/hooks/use-auto-save";

const saveBlockedReports = new Set<string>();

export function useProtocolSectionSave<T>(section: string) {
  const { report, readOnly, trackChangesMode, registerSectionFlush } =
    useReportData();
  const { value } = useGenericReportSection<T>(section);
  const [saveBlocked, setSaveBlocked] = useState(false);

  const onSave = useCallback(
    async (v: T) => {
      const res = await fetch(`/api/reports/${report.id}/sections/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: v }),
      });
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
      ((!readOnly &&
        report.status !== "submitted" &&
        report.status !== "approved") ||
        trackChangesMode) &&
      !saveBlocked,
    value,
    onSave,
    beaconUrl: `/api/reports/${report.id}/sections/${section}`,
    serialize: (v) => JSON.stringify({ content: v }),
  });

  useEffect(
    () => registerSectionFlush(section, flush),
    [section, flush, registerSectionFlush]
  );

  return { status, lastSavedAt, value, flushSave: flush };
}
