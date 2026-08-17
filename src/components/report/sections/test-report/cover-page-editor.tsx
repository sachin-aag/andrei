"use client";

import { useCallback } from "react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReportData } from "@/providers/report-provider";
import {
  verificationTestReportMetadata,
  type ReportRecord,
} from "@/types/report";
import type { VerificationTestReportMetadata } from "@/db/schema";

export function TestReportCoverPageEditor() {
  const { report, setReport, readOnly } = useReportData();
  const meta = verificationTestReportMetadata(report);

  const patchMetadata = useCallback(
    async (patch: Partial<VerificationTestReportMetadata>) => {
      const nextMeta = { ...meta, ...patch };
      setReport((prev) => ({ ...prev, metadata: nextMeta }));
      await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: nextMeta }),
      });
    },
    [meta, report.id, setReport]
  );

  const patchDocumentNo = useCallback(
    async (documentNo: string) => {
      setReport((prev) => ({ ...prev, documentNo }));
      await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentNo }),
      });
    },
    [report.id, setReport]
  );

  return (
    <SectionShell
      title="Cover Page"
      description="Document identity used for evaluation and export."
      status="idle"
      lastSavedAt={null}
      section="cover_page"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="tr-document-no"
          label="Document Number"
          value={report.documentNo}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev: ReportRecord) => ({
              ...prev,
              documentNo: value,
            }))
          }
          onBlur={(value) => void patchDocumentNo(value.trim())}
        />
        <Field
          id="tr-revision"
          label="Revision"
          value={meta.revision}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, revision: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ revision: value.trim() })}
        />
        <Field
          id="tr-product"
          label="Product name"
          value={meta.productName}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, productName: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ productName: value.trim() })}
        />
        <Field
          id="tr-project"
          label="Project name"
          value={meta.projectName}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, projectName: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ projectName: value.trim() })}
        />
        <Field
          id="tr-dhf"
          label="DHF index"
          value={meta.dhfIndex}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, dhfIndex: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ dhfIndex: value.trim() })}
        />
        <Field
          id="tr-leader"
          label="Project leader"
          value={meta.projectLeader}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, projectLeader: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ projectLeader: value.trim() })}
        />
        <Field
          id="tr-eco"
          label="ECO / DCO"
          value={meta.ecoDco}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, ecoDco: value },
            }))
          }
          onBlur={(value) => void patchMetadata({ ecoDco: value.trim() })}
        />
        <Field
          id="tr-source-protocol"
          label="Source protocol report ID"
          value={meta.sourceProtocolReportId ?? ""}
          disabled={readOnly}
          onChange={(value) =>
            setReport((prev) => ({
              ...prev,
              metadata: { ...meta, sourceProtocolReportId: value },
            }))
          }
          onBlur={(value) =>
            void patchMetadata({ sourceProtocolReportId: value.trim() || undefined })
          }
        />
      </div>
    </SectionShell>
  );
}

function Field({
  id,
  label,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
      />
    </div>
  );
}
