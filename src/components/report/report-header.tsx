"use client";

import { useState } from "react";
import { CalendarDays, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveStatus } from "./save-status";
import { useReportData } from "@/providers/report-provider";
import {
  investigationOtherTools,
  investigationToolsUsed,
  elrMetadata,
  qraMetadata,
  type ReportRecord,
} from "@/types/report";
import type { QraMetadata } from "@/lib/document-types/qra/sections";
import type { ElrMetadata } from "@/lib/document-types/elr/sections";

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
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
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
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState<ElrMetadata>(() => elrMetadata(report));

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly,
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

  const set = (key: keyof ElrMetadata) => (next: string) =>
    setMeta((prev) => ({ ...prev, [key]: next }));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Identity fields print on the Word title page. A separate ELR is
            compiled for each container format; line-level records are reported
            in both and marked Line-common.
          </p>
          {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="elr-report-no"
            label="ELR Report No."
            value={documentNo}
            placeholder="ELR/DP/PR/26/001"
            disabled={readOnly}
            onChange={setDocumentNo}
          />
          <IdentityField
            id="elr-cycle-no"
            label="ELR Cycle No."
            value={meta.cycleNo}
            disabled={readOnly}
            onChange={set("cycleNo")}
          />
          <IdentityField
            id="elr-equipment-name"
            label="Equipment name"
            value={meta.equipmentName}
            placeholder="Filling and Capping Machine"
            disabled={readOnly}
            onChange={set("equipmentName")}
          />
          <IdentityField
            id="elr-equipment-id"
            label="Equipment ID"
            value={meta.equipmentId}
            placeholder="E/PR/070"
            disabled={readOnly}
            onChange={set("equipmentId")}
          />
          <IdentityField
            id="elr-system-id"
            label="Associated computerized system / ID"
            value={meta.systemId}
            placeholder="SCADA for Filling Line (E/PR/077)"
            disabled={readOnly}
            onChange={set("systemId")}
          />
          <IdentityField
            id="elr-format-scope"
            label="Container format / product scope"
            value={meta.formatScope}
            placeholder="Vial"
            disabled={readOnly}
            onChange={set("formatScope")}
          />
          <IdentityField
            id="elr-location"
            label="Location / area"
            value={meta.location}
            placeholder="Filling and capping room (GF-89)"
            disabled={readOnly}
            onChange={set("location")}
          />
          <IdentityField
            id="elr-department"
            label="Department"
            value={meta.department}
            disabled={readOnly}
            onChange={set("department")}
          />
          <IdentityField
            id="elr-risk-classification"
            label="System impact (SLIA)"
            value={meta.riskClassification}
            placeholder="Direct Impact"
            disabled={readOnly}
            onChange={set("riskClassification")}
          />
          <IdentityField
            id="elr-frequency"
            label="ELR frequency (per VMP)"
            value={meta.elrFrequency}
            placeholder="Half yearly"
            disabled={readOnly}
            onChange={set("elrFrequency")}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="elr-period-from">
              ELR period — from
              <CalendarDays className="ml-1 inline size-3" />
            </Label>
            <Input
              id="elr-period-from"
              type="date"
              value={meta.periodFrom}
              disabled={readOnly}
              onChange={(e) => set("periodFrom")(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="elr-period-to">
              ELR period — to
              <CalendarDays className="ml-1 inline size-3" />
            </Label>
            <Input
              id="elr-period-to"
              type="date"
              value={meta.periodTo}
              disabled={readOnly}
              onChange={(e) => set("periodTo")(e.target.value)}
            />
          </div>
          <IdentityField
            id="elr-last-prq-no"
            label="Last PRQ No."
            value={meta.lastPrqNo}
            placeholder="PRQR-25-PR-060"
            disabled={readOnly}
            onChange={set("lastPrqNo")}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="elr-last-prq-date">
              Last PRQ completion date
              <CalendarDays className="ml-1 inline size-3" />
            </Label>
            <Input
              id="elr-last-prq-date"
              type="date"
              value={meta.lastPrqDate}
              disabled={readOnly}
              onChange={(e) => set("lastPrqDate")(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="elr-next-prq-date">
              Next PRQ due date
              <CalendarDays className="ml-1 inline size-3" />
            </Label>
            <Input
              id="elr-next-prq-date"
              type="date"
              value={meta.nextPrqDate}
              disabled={readOnly}
              onChange={(e) => set("nextPrqDate")(e.target.value)}
            />
          </div>
          <IdentityField
            id="elr-revision"
            label="Revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={set("revision")}
          />
        </div>
      </CardContent>
    </Card>
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
  const [date, setDate] = useState(report.date.slice(0, 10));
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState<QraMetadata>(() => qraMetadata(report));

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly,
    value: { date, documentNo, meta },
    onSave: async (v, context) => {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date(v.date).toISOString(),
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

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Identity fields print in the Word header. Pre/post approval are
            signature placeholders.
          </p>
          {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="qra-ra-no"
            label="RA Number"
            value={documentNo}
            placeholder="RA/DP/QA/26/001"
            disabled={readOnly}
            onChange={setDocumentNo}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="qra-date">
              Date
              <CalendarDays className="ml-1 inline size-3" />
            </Label>
            <Input
              id="qra-date"
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <IdentityField
            id="qra-revision"
            label="Revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={(revision) => setMeta((prev) => ({ ...prev, revision }))}
          />
          <IdentityField
            id="qra-department"
            label="Department"
            value={meta.department}
            disabled={readOnly}
            onChange={(department) =>
              setMeta((prev) => ({ ...prev, department }))
            }
          />
          <div className="sm:col-span-2">
            <IdentityField
              id="qra-title"
              label="Title"
              value={meta.title}
              disabled={readOnly}
              onChange={(title) => setMeta((prev) => ({ ...prev, title }))}
            />
          </div>
          <IdentityField
            id="qra-product"
            label="Product / process / equipment"
            value={meta.productName}
            disabled={readOnly}
            onChange={(productName) =>
              setMeta((prev) => ({ ...prev, productName }))
            }
          />
          <IdentityField
            id="qra-id-no"
            label="ID No."
            value={meta.idNo}
            disabled={readOnly}
            onChange={(idNo) => setMeta((prev) => ({ ...prev, idNo }))}
          />
          <IdentityField
            id="qra-source-name"
            label="Source document name"
            value={meta.sourceDocumentName}
            disabled={readOnly}
            onChange={(sourceDocumentName) =>
              setMeta((prev) => ({ ...prev, sourceDocumentName }))
            }
          />
          <IdentityField
            id="qra-source-no"
            label="Source document no."
            value={meta.sourceDocumentNo}
            disabled={readOnly}
            onChange={(sourceDocumentNo) =>
              setMeta((prev) => ({ ...prev, sourceDocumentNo }))
            }
          />
          <IdentityField
            id="qra-pre-approval"
            label="Pre-approval (print placeholder)"
            value={meta.preApproval}
            disabled={readOnly}
            onChange={(preApproval) =>
              setMeta((prev) => ({ ...prev, preApproval }))
            }
          />
          <IdentityField
            id="qra-post-approval"
            label="Post-approval (print placeholder)"
            value={meta.postApproval}
            disabled={readOnly}
            onChange={(postApproval) =>
              setMeta((prev) => ({ ...prev, postApproval }))
            }
          />
        </div>
      </CardContent>
    </Card>
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
