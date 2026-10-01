"use client";

import { useCallback } from "react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { SectionSuggestionCard } from "@/components/report/suggestion-card";
import { IdentitySuggestionField } from "@/components/report/identity-suggestion-field";
import { useIdentityFormSave } from "@/hooks/use-identity-form-save";
import { useReportData } from "@/providers/report-provider";
import {
  designVerificationMetadata,
  type ReportRecord,
} from "@/types/report";
import type { DesignVerificationMetadata } from "@/db/schema";
import type { SectionType } from "@/db/schema";

export function DvCoverPageEditor() {
  const { report, setReport, readOnly } = useReportData();
  const toPatch = useCallback(
    (v: { documentNo: string; meta: DesignVerificationMetadata }) => ({
      documentNo: v.documentNo.trim(),
      metadata: v.meta,
    }),
    []
  );
  const applyToReport = useCallback(
    (v: { documentNo: string; meta: DesignVerificationMetadata }) => {
      setReport((r: ReportRecord) => ({
        ...r,
        documentNo: v.documentNo,
        metadata: {
          ...(r.metadata as Record<string, unknown>),
          ...v.meta,
        },
      }));
    },
    [setReport]
  );
  const { value, update, status, lastSavedAt } = useIdentityFormSave({
    reportId: report.id,
    reportUpdatedAt: report.updatedAt,
    readOnly,
    incoming: {
      documentNo: report.documentNo,
      meta: designVerificationMetadata(report),
    },
    toPatch,
    applyToReport,
  });
  const { documentNo, meta } = value;

  const setDocumentNoLive = useCallback(
    (next: string) => {
      update((prev) => ({ ...prev, documentNo: next }));
    },
    [update]
  );

  const setMetaLive = useCallback(
    (key: keyof DesignVerificationMetadata) => (next: string) => {
      update((prev) => ({
        ...prev,
        meta: { ...prev.meta, [key]: next },
      }));
    },
    [update]
  );

  return (
    <section id="identity" className="space-y-2">
      <SectionShell
        title="Cover Page"
        status={status}
        lastSavedAt={lastSavedAt}
        section="cover_page"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentitySuggestionField
            id="dv-document-no"
            label="Document Number"
            fieldKey="documentNo"
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentitySuggestionField
            id="dv-revision"
            label="Revision"
            fieldKey="revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={setMetaLive("revision")}
          />
          <IdentitySuggestionField
            id="dv-product"
            label="Product Name"
            fieldKey="productName"
            value={meta.productName}
            disabled={readOnly}
            onChange={setMetaLive("productName")}
          />
        </div>
      </SectionShell>
      <SectionSuggestionCard
        section={"identity" as SectionType}
        hideWhenEmpty
      />
    </section>
  );
}
