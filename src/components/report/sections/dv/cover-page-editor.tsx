"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { SectionSuggestionCard } from "@/components/report/suggestion-card";
import {
  IdentitySuggestionField,
  useIdentitySavePaused,
} from "@/components/report/identity-suggestion-field";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useReportData } from "@/providers/report-provider";
import {
  designVerificationMetadata,
  type ReportRecord,
} from "@/types/report";
import type { DesignVerificationMetadata } from "@/db/schema";
import type { SectionType } from "@/db/schema";

export function DvCoverPageEditor() {
  const { report, setReport, readOnly } = useReportData();
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState(() => designVerificationMetadata(report));
  const pauseSave = useIdentitySavePaused();

  useEffect(() => {
    setDocumentNo(report.documentNo);
    setMeta(designVerificationMetadata(report));
  }, [report.documentNo, report.metadata]);

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly && !pauseSave,
    value: { documentNo, meta },
    onSave: async (v, context) => {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentNo: v.documentNo.trim(),
          metadata: v.meta,
        }),
        signal: context?.signal,
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setReport(data.report);
    },
  });

  const setDocumentNoLive = useCallback(
    (next: string) => {
      setDocumentNo(next);
      setReport((prev: ReportRecord) => ({ ...prev, documentNo: next }));
    },
    [setReport]
  );

  const setMetaLive = useCallback(
    (key: keyof DesignVerificationMetadata) => (next: string) => {
      setMeta((prev) => {
        const metadata = { ...prev, [key]: next };
        setReport((r) => ({ ...r, metadata }));
        return metadata;
      });
    },
    [setReport]
  );

  return (
    <section id="identity" className="space-y-2">
      <SectionShell
        title="Cover Page"
        description="Document identity fields used for evaluation and export."
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
