"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { captureEvent } from "@/lib/analytics/events";

export function exportHref(reportId: string, omitCitations: boolean): string {
  const path = `/api/reports/${reportId}/export`;
  return omitCitations ? `${path}?omitCitations=1` : path;
}

/**
 * Plain one-click export. Pack-specific variants (e.g. without citations) live
 * in the overflow menu so the bar stays a single control.
 */
export function ReportExportButton({ reportId }: { reportId: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href={exportHref(reportId, false)}
        target="_blank"
        rel="noreferrer"
        onClick={() => captureEvent("report_exported", { reportId, omitCitations: false })}
      >
        <Download className="size-4" aria-hidden="true" />
        Export DOCX
      </a>
    </Button>
  );
}
