"use client";

import { useCallback, useState } from "react";
import { CalendarDays, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoSave, type SaveStatus as SaveStatusType } from "@/hooks/use-auto-save";
import { useIdentityFormSave } from "@/hooks/use-identity-form-save";
import { SaveStatus } from "./save-status";
import { IdentitySuggestionField } from "./identity-suggestion-field";
import { SectionSuggestionCard } from "./suggestion-card";
import { useReportData } from "@/providers/report-provider";
import {
  investigationOtherTools,
  investigationToolsUsed,
  elrMetadata,
  firMetadata,
  qraMetadata,
  type ReportRecord,
} from "@/types/report";
import type { QraMetadata } from "@/lib/document-types/qra/sections";
import type { ElrMetadata } from "@/lib/document-types/elr/sections";
import type { FirMetadata } from "@/lib/document-types/fir/sections";
import {
  qsrMetadataFrom,
  type QsrMetadata,
} from "@/lib/document-types/qsr/sections";
import {
  cvpMetadataFrom,
  type CvpMetadata,
} from "@/lib/document-types/cvp/sections";
import type { SectionType } from "@/db/schema";
import { parseIdentityDate } from "@/lib/ai/chat/identity";

function identityDatePatch(value: string): string | undefined {
  const isoDay = parseIdentityDate(value);
  return isoDay ? new Date(`${isoDay}T00:00:00.000Z`).toISOString() : undefined;
}

/** Keep ISO days as YYYY-MM-DD; leave free-text identity dates intact. */
function identityDateInputValue(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function ReportHeaderForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const [date, setDate] = useState(report.date.slice(0, 10));
  const [toolsUsed, setToolsUsed] = useState(() => investigationToolsUsed(report));
  const [otherTools, setOtherTools] = useState(() =>
    investigationOtherTools(report)
  );

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly,
    value: { date, toolsUsed, otherTools },
    onSave: async (v, context) => {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date(v.date).toISOString(),
          toolsUsed: v.toolsUsed,
          otherTools: v.otherTools,
        }),
        signal: context?.signal,
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setReport(data.report);
    },
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="grid gap-2 min-w-[180px]">
            <Label>
              Date
              <CalendarDays className="inline size-3 ml-1" />
            </Label>
            <Input
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="ml-auto self-end">
            {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
          </div>
        </div>

        <div>
          <Label>
            <Wrench className="inline size-3 mr-1" />
            Investigation Tool Used
          </Label>
          <div className="flex flex-wrap gap-4 mt-2">
            {([
              ["sixM", "6M"],
              ["fiveWhy", "5 Why"],
              ["brainstorming", "Brainstorming"],
            ] as const).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={toolsUsed[key]}
                  onCheckedChange={(v) =>
                    setToolsUsed((prev) => ({ ...prev, [key]: v === true }))
                  }
                  disabled={readOnly}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Other Tools (If any)</Label>
          <Textarea
            placeholder="Not applicable"
            value={otherTools}
            disabled={readOnly}
            onChange={(e) => setOtherTools(e.target.value)}
            className="min-h-[60px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function IdentityField({
  id,
  label,
  value,
  disabled,
  onChange,
  fieldKey,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  fieldKey: string;
}) {
  return (
    <IdentitySuggestionField
      id={id}
      label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
      fieldKey={fieldKey}
    />
  );
}

function IdentityHeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <section id="identity" className="space-y-2">
      {children}
      <SectionSuggestionCard
        section={"identity" as SectionType}
        hideWhenEmpty
      />
    </section>
  );
}

function IdentitySaveRow({
  readOnly,
  status,
  lastSavedAt,
}: {
  readOnly: boolean;
  status: SaveStatusType;
  lastSavedAt: Date | null;
}) {
  if (readOnly) return null;
  return (
    <div className="flex justify-end">
      <SaveStatus status={status} lastSavedAt={lastSavedAt} />
    </div>
  );
}

function mergeIdentityMetadata(
  prev: ReportRecord,
  meta: Record<string, unknown>
): ReportRecord["metadata"] {
  return { ...(prev.metadata as Record<string, unknown>), ...meta };
}

/**
 * ELR title-page identity. The container format matters: a separate ELR is
 * compiled per format, and the format scopes the qualification and QMS rows.
 * The review interval is risk-based, so frequency is a field, not a constant.
 */
function ElrIdentityForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const toPatch = useCallback(
    (v: { documentNo: string; meta: ElrMetadata }) => ({
      documentNo: v.documentNo.trim(),
      metadata: v.meta,
    }),
    []
  );
  const applyToReport = useCallback(
    (v: { documentNo: string; meta: ElrMetadata }) => {
      setReport((r) => ({
        ...r,
        documentNo: v.documentNo,
        metadata: mergeIdentityMetadata(r, v.meta),
      }));
    },
    [setReport]
  );
  const { value, update, status, lastSavedAt } = useIdentityFormSave({
    reportId: report.id,
    reportUpdatedAt: report.updatedAt,
    readOnly,
    incoming: { documentNo: report.documentNo, meta: elrMetadata(report) },
    toPatch,
    applyToReport,
  });
  const { documentNo, meta } = value;
  const setDocumentNoLive = (next: string) => {
    update((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof ElrMetadata) => (next: string) => {
    update((prev) => ({ ...prev, meta: { ...prev.meta, [key]: next } }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <IdentitySaveRow
          readOnly={readOnly}
          status={status}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="elr-report-no"
            fieldKey="documentNo"
            label="ELR Report No."
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="elr-cycle-no"
            fieldKey="cycleNo"
            label="ELR Cycle No."
            value={meta.cycleNo}
            disabled={readOnly}
            onChange={set("cycleNo")}
          />
          <IdentityField
            id="elr-equipment-name"
            fieldKey="equipmentName"
            label="Equipment name"
            value={meta.equipmentName}
            disabled={readOnly}
            onChange={set("equipmentName")}
          />
          <IdentityField
            id="elr-equipment-make"
            fieldKey="equipmentMake"
            label="Equipment make"
            value={meta.equipmentMake}
            disabled={readOnly}
            onChange={set("equipmentMake")}
          />
          <IdentityField
            id="elr-equipment-model"
            fieldKey="equipmentModel"
            label="Equipment model"
            value={meta.equipmentModel}
            disabled={readOnly}
            onChange={set("equipmentModel")}
          />
          <IdentityField
            id="elr-equipment-id"
            fieldKey="equipmentId"
            label="Equipment ID"
            value={meta.equipmentId}
            disabled={readOnly}
            onChange={set("equipmentId")}
          />
          <IdentityField
            id="elr-system-id"
            fieldKey="systemId"
            label="Associated computerized system / ID"
            value={meta.systemId}
            disabled={readOnly}
            onChange={set("systemId")}
          />
          <IdentityField
            id="elr-format-scope"
            fieldKey="formatScope"
            label="Container format / product scope"
            value={meta.formatScope}
            disabled={readOnly}
            onChange={set("formatScope")}
          />
          <IdentityField
            id="elr-location"
            fieldKey="location"
            label="Location / area"
            value={meta.location}
            disabled={readOnly}
            onChange={set("location")}
          />
          <IdentityField
            id="elr-department"
            fieldKey="department"
            label="Department"
            value={meta.department}
            disabled={readOnly}
            onChange={set("department")}
          />
          <IdentityField
            id="elr-risk-classification"
            fieldKey="riskClassification"
            label="System impact (SLIA)"
            value={meta.riskClassification}
            disabled={readOnly}
            onChange={set("riskClassification")}
          />
          <IdentityField
            id="elr-frequency"
            fieldKey="elrFrequency"
            label="ELR frequency (per VMP)"
            value={meta.elrFrequency}
            disabled={readOnly}
            onChange={set("elrFrequency")}
          />
          <IdentityField
            id="elr-period-from"
            fieldKey="periodFrom"
            label="ELR period — from"
            value={meta.periodFrom}
            disabled={readOnly}
            onChange={set("periodFrom")}
          />
          <IdentityField
            id="elr-period-to"
            fieldKey="periodTo"
            label="ELR period — to"
            value={meta.periodTo}
            disabled={readOnly}
            onChange={set("periodTo")}
          />
          <IdentityField
            id="elr-last-prq-no"
            fieldKey="lastPrqNo"
            label="Last PRQ No."
            value={meta.lastPrqNo}
            disabled={readOnly}
            onChange={set("lastPrqNo")}
          />
          <IdentityField
            id="elr-last-prq-date"
            fieldKey="lastPrqDate"
            label="Last PRQ completion date"
            value={meta.lastPrqDate}
            disabled={readOnly}
            onChange={set("lastPrqDate")}
          />
          <IdentityField
            id="elr-next-prq-date"
            fieldKey="nextPrqDate"
            label="Next PRQ due date"
            value={meta.nextPrqDate}
            disabled={readOnly}
            onChange={set("nextPrqDate")}
          />
          <IdentityField
            id="elr-revision"
            fieldKey="revision"
            label="Revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={set("revision")}
          />
        </div>
      </CardContent>
    </Card>
    </IdentityHeaderShell>
  );
}

function QraIdentityForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const toPatch = useCallback(
    (v: { date: string; documentNo: string; meta: QraMetadata }) => {
      const date = identityDatePatch(v.date);
      return {
        ...(date ? { date } : {}),
        documentNo: v.documentNo.trim(),
        metadata: v.meta,
      };
    },
    []
  );
  const applyToReport = useCallback(
    (v: { date: string; documentNo: string; meta: QraMetadata }) => {
      setReport((r) => ({
        ...r,
        date: v.date,
        documentNo: v.documentNo,
        metadata: mergeIdentityMetadata(r, v.meta),
      }));
    },
    [setReport]
  );
  const { value, update, status, lastSavedAt } = useIdentityFormSave({
    reportId: report.id,
    reportUpdatedAt: report.updatedAt,
    readOnly,
    incoming: {
      date: identityDateInputValue(report.date),
      documentNo: report.documentNo,
      meta: qraMetadata(report),
    },
    toPatch,
    applyToReport,
  });
  const { date, documentNo, meta } = value;
  const setDocumentNoLive = (next: string) => {
    update((prev) => ({ ...prev, documentNo: next }));
  };
  const setDateLive = (next: string) => {
    update((prev) => ({ ...prev, date: next }));
  };
  const setMetaKey = (key: keyof QraMetadata) => (next: string) => {
    update((prev) => ({ ...prev, meta: { ...prev.meta, [key]: next } }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <IdentitySaveRow
          readOnly={readOnly}
          status={status}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="qra-ra-no"
            fieldKey="documentNo"
            label="RA Number"
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="qra-date"
            fieldKey="date"
            label="Date"
            value={date}
            disabled={readOnly}
            onChange={setDateLive}
          />
          <IdentityField
            id="qra-revision"
            fieldKey="revision"
            label="Revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={setMetaKey("revision")}
          />
          <IdentityField
            id="qra-department"
            fieldKey="department"
            label="Department"
            value={meta.department}
            disabled={readOnly}
            onChange={setMetaKey("department")}
          />
          <div className="sm:col-span-2">
            <IdentityField
              id="qra-title"
              fieldKey="title"
              label="Title"
              value={meta.title}
              disabled={readOnly}
              onChange={setMetaKey("title")}
            />
          </div>
          <IdentityField
            id="qra-product"
            fieldKey="productName"
            label="Product / process / equipment"
            value={meta.productName}
            disabled={readOnly}
            onChange={setMetaKey("productName")}
          />
          <IdentityField
            id="qra-id-no"
            fieldKey="idNo"
            label="ID No."
            value={meta.idNo}
            disabled={readOnly}
            onChange={setMetaKey("idNo")}
          />
          <IdentityField
            id="qra-source-name"
            fieldKey="sourceDocumentName"
            label="Source document name"
            value={meta.sourceDocumentName}
            disabled={readOnly}
            onChange={setMetaKey("sourceDocumentName")}
          />
          <IdentityField
            id="qra-source-no"
            fieldKey="sourceDocumentNo"
            label="Source document no."
            value={meta.sourceDocumentNo}
            disabled={readOnly}
            onChange={setMetaKey("sourceDocumentNo")}
          />
          <IdentityField
            id="qra-pre-approval"
            fieldKey="preApproval"
            label="Pre-approval (print placeholder)"
            value={meta.preApproval}
            disabled={readOnly}
            onChange={setMetaKey("preApproval")}
          />
          <IdentityField
            id="qra-post-approval"
            fieldKey="postApproval"
            label="Post-approval (print placeholder)"
            value={meta.postApproval}
            disabled={readOnly}
            onChange={setMetaKey("postApproval")}
          />
        </div>
      </CardContent>
    </Card>
    </IdentityHeaderShell>
  );
}

function FirIdentityForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const toPatch = useCallback(
    (v: { date: string; documentNo: string; meta: FirMetadata }) => {
      const date = identityDatePatch(v.date);
      return {
        ...(date ? { date } : {}),
        documentNo: v.documentNo.trim(),
        metadata: v.meta,
      };
    },
    []
  );
  const applyToReport = useCallback(
    (v: { date: string; documentNo: string; meta: FirMetadata }) => {
      setReport((r) => ({
        ...r,
        date: v.date,
        documentNo: v.documentNo,
        metadata: mergeIdentityMetadata(r, v.meta),
      }));
    },
    [setReport]
  );
  const { value, update, status, lastSavedAt } = useIdentityFormSave({
    reportId: report.id,
    reportUpdatedAt: report.updatedAt,
    readOnly,
    incoming: {
      date: identityDateInputValue(report.date),
      documentNo: report.documentNo,
      meta: firMetadata(report),
    },
    toPatch,
    applyToReport,
  });
  const { date, documentNo, meta } = value;
  const setDocumentNoLive = (next: string) => {
    update((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof FirMetadata) => (next: string) => {
    update((prev) => ({ ...prev, meta: { ...prev.meta, [key]: next } }));
  };
  const setDateLive = (next: string) => {
    update((prev) => ({
      ...prev,
      date: next,
      meta: { ...prev.meta, dateOfNonConformance: next },
    }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <IdentitySaveRow
          readOnly={readOnly}
          status={status}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="fir-source-doc-no"
            fieldKey="documentNo"
            label="Source Document No."
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="fir-date"
            fieldKey="date"
            label="Date of non-conformance"
            value={date}
            disabled={readOnly}
            onChange={setDateLive}
          />
          <IdentityField
            id="fir-product"
            fieldKey="productName"
            label="Product name"
            value={meta.productName}
            disabled={readOnly}
            onChange={set("productName")}
          />
          <IdentityField
            id="fir-batch"
            fieldKey="batchNo"
            label="Batch No."
            value={meta.batchNo}
            disabled={readOnly}
            onChange={set("batchNo")}
          />
          <IdentityField
            id="fir-equipment-id"
            fieldKey="equipmentId"
            label="Equipment ID"
            value={meta.equipmentId}
            disabled={readOnly}
            onChange={set("equipmentId")}
          />
          <IdentityField
            id="fir-unit"
            fieldKey="unit"
            label="Unit"
            value={meta.unit}
            disabled={readOnly}
            onChange={set("unit")}
          />
          <IdentityField
            id="fir-reference-sop"
            fieldKey="referenceSopNo"
            label="Reference SOP No."
            value={meta.referenceSopNo}
            disabled={readOnly}
            onChange={set("referenceSopNo")}
          />
        </div>
      </CardContent>
    </Card>
    </IdentityHeaderShell>
  );
}

function QsrIdentityForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const toPatch = useCallback(
    (v: { documentNo: string; meta: QsrMetadata }) => ({
      documentNo: v.documentNo.trim(),
      metadata: v.meta,
    }),
    []
  );
  const applyToReport = useCallback(
    (v: { documentNo: string; meta: QsrMetadata }) => {
      setReport((r) => ({
        ...r,
        documentNo: v.documentNo,
        metadata: mergeIdentityMetadata(r, v.meta),
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
      meta: qsrMetadataFrom(report.metadata),
    },
    toPatch,
    applyToReport,
  });
  const { documentNo, meta } = value;
  const setDocumentNoLive = (next: string) => {
    update((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof QsrMetadata) => (next: string) => {
    update((prev) => ({ ...prev, meta: { ...prev.meta, [key]: next } }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <IdentitySaveRow
          readOnly={readOnly}
          status={status}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="qsr-equipment-name"
            fieldKey="equipmentName"
            label="Equipment / System"
            value={meta.equipmentName}
            disabled={readOnly}
            onChange={set("equipmentName")}
          />
          <IdentityField
            id="qsr-equipment-code"
            fieldKey="equipmentCode"
            label="Equipment Number"
            value={meta.equipmentCode}
            disabled={readOnly}
            onChange={set("equipmentCode")}
          />
          <IdentityField
            id="qsr-capacity"
            fieldKey="capacity"
            label="Capacity / Size"
            value={meta.capacity}
            disabled={readOnly}
            onChange={set("capacity")}
          />
          <IdentityField
            id="qsr-plant-section"
            fieldKey="plantSection"
            label="Section"
            value={meta.plantSection}
            disabled={readOnly}
            onChange={set("plantSection")}
          />
          <IdentityField
            id="qsr-report-no"
            fieldKey="documentNo"
            label="Report No."
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="qsr-revision"
            fieldKey="revision"
            label="Revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={set("revision")}
          />
          <IdentityField
            id="qsr-revision-description"
            fieldKey="revisionDescription"
            label="Revision description"
            value={meta.revisionDescription}
            disabled={readOnly}
            onChange={set("revisionDescription")}
          />
        </div>
      </CardContent>
    </Card>
    </IdentityHeaderShell>
  );
}

function CvpIdentityForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const toPatch = useCallback(
    (v: { documentNo: string; meta: CvpMetadata }) => ({
      documentNo: v.documentNo.trim(),
      metadata: v.meta,
    }),
    []
  );
  const applyToReport = useCallback(
    (v: { documentNo: string; meta: CvpMetadata }) => {
      setReport((r) => ({
        ...r,
        documentNo: v.documentNo,
        metadata: mergeIdentityMetadata(r, v.meta),
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
      meta: cvpMetadataFrom(report.metadata),
    },
    toPatch,
    applyToReport,
  });
  const { documentNo, meta } = value;
  const setDocumentNoLive = (next: string) => {
    update((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof CvpMetadata) => (next: string) => {
    update((prev) => ({ ...prev, meta: { ...prev.meta, [key]: next } }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <IdentitySaveRow
          readOnly={readOnly}
          status={status}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="cvp-product-name"
            fieldKey="productName"
            label="Name of the product"
            value={meta.productName}
            disabled={readOnly}
            onChange={set("productName")}
          />
          <IdentityField
            id="cvp-product-code"
            fieldKey="productCode"
            label="Product Code"
            value={meta.productCode}
            disabled={readOnly}
            onChange={set("productCode")}
          />
          <IdentityField
            id="cvp-stage"
            fieldKey="stage"
            label="Stage"
            value={meta.stage}
            disabled={readOnly}
            onChange={set("stage")}
          />
          <IdentityField
            id="cvp-plant"
            fieldKey="plant"
            label="Plant"
            value={meta.plant}
            disabled={readOnly}
            onChange={set("plant")}
          />
          <IdentityField
            id="cvp-protocol-no"
            fieldKey="documentNo"
            label="Protocol No."
            value={documentNo}
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="cvp-department"
            fieldKey="department"
            label="Department"
            value={meta.department}
            disabled={readOnly}
            onChange={set("department")}
          />
          <IdentityField
            id="cvp-version"
            fieldKey="version"
            label="Version"
            value={meta.version}
            disabled={readOnly}
            onChange={set("version")}
          />
          <IdentityField
            id="cvp-effective-date"
            fieldKey="effectiveDate"
            label="Effective Date"
            value={meta.effectiveDate}
            disabled={readOnly}
            onChange={set("effectiveDate")}
          />
          <IdentityField
            id="cvp-document-title"
            fieldKey="documentTitle"
            label="Document Title"
            value={meta.documentTitle}
            disabled={readOnly}
            onChange={set("documentTitle")}
          />
        </div>
      </CardContent>
    </Card>
    </IdentityHeaderShell>
  );
}

export function ReportHeader() {
  const { report, setReport, readOnly } = useReportData();
  if (report.documentType === "equipment_lifecycle_report") {
    return (
      <ElrIdentityForm
        key={report.id}
        report={report}
        setReport={setReport}
        readOnly={readOnly}
      />
    );
  }
  if (report.documentType === "failure_investigation_report") {
    return (
      <FirIdentityForm
        key={report.id}
        report={report}
        setReport={setReport}
        readOnly={readOnly}
      />
    );
  }
  if (report.documentType === "qualification_summary_report") {
    return (
      <QsrIdentityForm
        key={report.id}
        report={report}
        setReport={setReport}
        readOnly={readOnly}
      />
    );
  }
  if (report.documentType === "cleaning_verification_protocol") {
    return (
      <CvpIdentityForm
        key={report.id}
        report={report}
        setReport={setReport}
        readOnly={readOnly}
      />
    );
  }
  if (report.documentType === "quality_risk_assessment") {
    return (
      <QraIdentityForm
        key={report.id}
        report={report}
        setReport={setReport}
        readOnly={readOnly}
      />
    );
  }
  // Investigation-only preamble (date + tool checkboxes). DV cover/control
  // fields live in the cover_page section editor instead. Generic documents
  // have no header chrome.
  if (report.documentType !== "investigation_report") {
    return null;
  }
  return (
    <ReportHeaderForm
      key={report.id}
      report={report}
      setReport={setReport}
      readOnly={readOnly}
    />
  );
}
