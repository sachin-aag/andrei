"use client";

import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { captureEvent } from "@/lib/analytics/events";
import { getCustomerPack } from "@/lib/customers/packs";

export function exportHref(reportId: string, omitCitations: boolean): string {
  const path = `/api/reports/${reportId}/export`;
  return omitCitations ? `${path}?omitCitations=1` : path;
}

export function ReportExportButton({ reportId }: { reportId: string }) {
  const omitCitationsEnabled = getCustomerPack().citationsAtEndOfSection;
  const defaultHref = exportHref(reportId, false);
  const omitHref = exportHref(reportId, true);

  const track = (omitCitations: boolean) => {
    captureEvent("report_exported", { reportId, omitCitations });
  };

  const defaultLink = (
    <a
      href={defaultHref}
      target="_blank"
      rel="noreferrer"
      onClick={() => track(false)}
    >
      <Download className="size-4" aria-hidden="true" />
      Export DOCX
    </a>
  );

  if (!omitCitationsEnabled) {
    return (
      <Button variant="outline" size="sm" asChild>
        {defaultLink}
      </Button>
    );
  }

  return (
    <div className="inline-flex items-stretch">
      <Button
        variant="outline"
        size="sm"
        asChild
        className="rounded-r-none border-r-0"
      >
        {defaultLink}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-l-none px-1.5"
            aria-label="More export options"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a
              href={defaultHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track(false)}
            >
              Export DOCX
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={omitHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track(true)}
            >
              Export without citations
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
