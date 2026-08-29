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
import type { DocumentType } from "@/db/schema";
import { citationsAtEndOfSectionFor } from "@/lib/document-types";
import { analyticsExportHref } from "@/lib/statistical-analysis/export-xlsx";

export function exportHref(reportId: string, omitCitations: boolean): string {
  const path = `/api/reports/${reportId}/export`;
  return omitCitations ? `${path}?omitCitations=1` : path;
}

export function sourceDocxHref(reportId: string): string {
  return `/api/reports/${reportId}/source-docx`;
}

export function ReportExportButton({
  reportId,
  sourceDocxFilename,
  documentType,
  surface = "document",
}: {
  reportId: string;
  sourceDocxFilename?: string | null;
  documentType?: DocumentType;
  surface?: "document" | "analytics";
}) {
  const analyticsSurface = surface === "analytics";
  const omitCitationsEnabled = citationsAtEndOfSectionFor(documentType);
  const hasOriginal = Boolean(sourceDocxFilename);
  const defaultHref = analyticsSurface
    ? analyticsExportHref(reportId, false)
    : exportHref(reportId, false);
  const omitHref = exportHref(reportId, true);
  const plotsHref = analyticsExportHref(reportId, true);
  const originalHref = sourceDocxHref(reportId);

  const track = (props: Record<string, unknown>) => {
    captureEvent("report_exported", { reportId, ...props });
  };

  if (analyticsSurface) {
    const defaultLink = (
      <a
        href={defaultHref}
        target="_blank"
        rel="noreferrer"
        onClick={() => track({ format: "xlsx", includePlots: false })}
      >
        <Download className="size-4" aria-hidden="true" />
        Export XLSX
      </a>
    );

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
                onClick={() => track({ format: "xlsx", includePlots: false })}
              >
                Export XLSX
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={plotsHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => track({ format: "xlsx", includePlots: true })}
              >
                Export with plots
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const defaultLink = (
    <a
      href={defaultHref}
      target="_blank"
      rel="noreferrer"
      onClick={() => track({ omitCitations: false })}
    >
      <Download className="size-4" aria-hidden="true" />
      Export DOCX
    </a>
  );

  if (!omitCitationsEnabled && !hasOriginal) {
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
              onClick={() => track({ omitCitations: false })}
            >
              Export DOCX
            </a>
          </DropdownMenuItem>
          {omitCitationsEnabled ? (
            <DropdownMenuItem asChild>
              <a
                href={omitHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => track({ omitCitations: true })}
              >
                Export without citations
              </a>
            </DropdownMenuItem>
          ) : null}
          {hasOriginal ? (
            <DropdownMenuItem asChild>
              <a href={originalHref} rel="noreferrer">
                Download original
                {sourceDocxFilename ? ` (${sourceDocxFilename})` : ""}
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
