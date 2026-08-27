"use client";

import type { JSONContent } from "@tiptap/core";
import { AlertTriangle } from "lucide-react";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { SaveStatus } from "@/components/report/save-status";
import { PagedDocumentSurface } from "@/components/report/sections/generic/paged-document-surface";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import type { GenericDocumentMetadata } from "@/db/schema";
import { GENERIC_DOCUMENT_SECTION } from "@/lib/document-types/generic/sections";

type BodyContent = { narrative: JSONContent };

export function GenericDocumentEditor() {
  const { report } = useReportData();
  const { update } = useGenericReportSection<BodyContent>(GENERIC_DOCUMENT_SECTION);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(GENERIC_DOCUMENT_SECTION);
  const content = (value as BodyContent | undefined) ?? {
    narrative: { type: "doc", content: [{ type: "paragraph" }] },
  };
  const meta = report.metadata as GenericDocumentMetadata;
  const importWarnings = meta.importWarnings ?? [];
  const importedFrom = meta.importedFromFilename;
  const title = report.documentNo.trim() || "Untitled";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="truncate text-xl font-semibold">{title}</h2>
        <SaveStatus status={status} lastSavedAt={lastSavedAt ?? null} />
      </div>
      {importWarnings.length > 0 ? (
        <div
          role="status"
          className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              Imported from {importedFrom ?? "Word"} with limited fidelity
            </p>
            <ul className="list-disc pl-4 text-xs leading-relaxed">
              {importWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-center overflow-x-auto pl-16">
        <PagedDocumentSurface>
          <TiptapSectionField
            section={GENERIC_DOCUMENT_SECTION}
            contentPath="narrative"
            chrome="page"
            placeholder="Start writing, or ask the assistant to draft."
            value={content.narrative}
            onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
            onFlushSave={flushSave}
          />
        </PagedDocumentSurface>
      </div>
    </div>
  );
}
