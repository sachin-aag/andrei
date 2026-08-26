"use client";

import type { JSONContent } from "@tiptap/core";
import { AlertTriangle } from "lucide-react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { useReportData } from "@/providers/report-provider";
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

  return (
    <SectionShell
      title="Document"
      description="A continuous Word-like body. Use headings from the toolbar. AI edits stay as tracked changes when you accept them."
      status={status}
      lastSavedAt={lastSavedAt}
      section={GENERIC_DOCUMENT_SECTION}
    >
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
      <TiptapSectionField
        section={GENERIC_DOCUMENT_SECTION}
        contentPath="narrative"
        label="Body"
        placeholder="Start writing, or ask the assistant to draft. Headings, lists, tables, and images are supported."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
