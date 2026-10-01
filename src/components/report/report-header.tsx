"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveStatus } from "./save-status";
import {
  IdentitySuggestionField,
  useIdentitySavePaused,
} from "./identity-suggestion-field";
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
import type { SectionType } from "@/db/schema";

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
  fieldKey,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  fieldKey: string;
  type?: "text" | "date";
}) {
  return (
    <IdentitySuggestionField
      id={id}
      label={label}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={onChange}
      fieldKey={fieldKey}
      type={type}
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

  useEffect(() => {
    setDocumentNo(report.documentNo);
    setMeta(elrMetadata(report));
  }, [report.documentNo, report.metadata]);

  const pauseSave = useIdentitySavePaused();
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

  const setDocumentNoLive = (next: string) => {
    setDocumentNo(next);
    setReport((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof ElrMetadata) => (next: string) => {
    setMeta((prev) => {
      const meta = { ...prev, [key]: next };
      setReport((r) => ({ ...r, metadata: meta }));
      return meta;
    });
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Identity fields print on the Word title page. Format No.
            SOP/DP/QA/014/F22-R00 is proposed — the SOP does not yet assign an
            ELR form number. A separate ELR is compiled for each container format;
            line-level records are reported in both and marked Line-common.
          </p>
          {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="elr-report-no"
            fieldKey="documentNo"
            label="ELR Report No."
            value={documentNo}
            placeholder="ELR/DP/PR/26/001"
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
            placeholder="Filling and Capping Machine"
            disabled={readOnly}
            onChange={set("equipmentName")}
          />
          <IdentityField
            id="elr-equipment-make"
            fieldKey="equipmentMake"
            label="Equipment make"
            value={meta.equipmentMake}
            placeholder="Steriline SRL"
            disabled={readOnly}
            onChange={set("equipmentMake")}
          />
          <IdentityField
            id="elr-equipment-model"
            fieldKey="equipmentModel"
            label="Equipment model"
            value={meta.equipmentModel}
            placeholder="VKFCM168"
            disabled={readOnly}
            onChange={set("equipmentModel")}
          />
          <IdentityField
            id="elr-equipment-id"
            fieldKey="equipmentId"
            label="Equipment ID"
            value={meta.equipmentId}
            placeholder="E/PR/070"
            disabled={readOnly}
            onChange={set("equipmentId")}
          />
          <IdentityField
            id="elr-system-id"
            fieldKey="systemId"
            label="Associated computerized system / ID"
            value={meta.systemId}
            placeholder="SCADA for Filling Line (E/PR/077)"
            disabled={readOnly}
            onChange={set("systemId")}
          />
          <IdentityField
            id="elr-format-scope"
            fieldKey="formatScope"
            label="Container format / product scope"
            value={meta.formatScope}
            placeholder="Vial"
            disabled={readOnly}
            onChange={set("formatScope")}
          />
          <IdentityField
            id="elr-location"
            fieldKey="location"
            label="Location / area"
            value={meta.location}
            placeholder="Filling and capping room (GF-89)"
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
            placeholder="Direct Impact"
            disabled={readOnly}
            onChange={set("riskClassification")}
          />
          <IdentityField
            id="elr-frequency"
            fieldKey="elrFrequency"
            label="ELR frequency (per VMP)"
            value={meta.elrFrequency}
            placeholder="Half yearly"
            disabled={readOnly}
            onChange={set("elrFrequency")}
          />
          <IdentityField
            id="elr-period-from"
            fieldKey="periodFrom"
            type="date"
            label="ELR period — from"
            value={meta.periodFrom}
            disabled={readOnly}
            onChange={set("periodFrom")}
          />
          <IdentityField
            id="elr-period-to"
            fieldKey="periodTo"
            type="date"
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
            placeholder="PRQR-25-PR-060"
            disabled={readOnly}
            onChange={set("lastPrqNo")}
          />
          <IdentityField
            id="elr-last-prq-date"
            fieldKey="lastPrqDate"
            type="date"
            label="Last PRQ completion date"
            value={meta.lastPrqDate}
            disabled={readOnly}
            onChange={set("lastPrqDate")}
          />
          <IdentityField
            id="elr-next-prq-date"
            fieldKey="nextPrqDate"
            type="date"
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
  const [date, setDate] = useState(report.date.slice(0, 10));
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState<QraMetadata>(() => qraMetadata(report));

  useEffect(() => {
    setDate(report.date.slice(0, 10));
    setDocumentNo(report.documentNo);
    setMeta(qraMetadata(report));
  }, [report.date, report.documentNo, report.metadata]);

  const pauseSave = useIdentitySavePaused();
  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly && !pauseSave,
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

  const setDocumentNoLive = (next: string) => {
    setDocumentNo(next);
    setReport((prev) => ({ ...prev, documentNo: next }));
  };
  const setDateLive = (next: string) => {
    setDate(next);
    setReport((prev) => ({ ...prev, date: next }));
  };
  const setMetaKey = (key: keyof QraMetadata) => (next: string) => {
    setMeta((prev) => {
      const meta = { ...prev, [key]: next };
      setReport((r) => ({ ...r, metadata: meta }));
      return meta;
    });
  };

  return (
    <IdentityHeaderShell>
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
            fieldKey="documentNo"
            label="RA Number"
            value={documentNo}
            placeholder="RA/DP/QA/26/001"
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="qra-date"
            fieldKey="date"
            type="date"
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
  const [date, setDate] = useState(report.date.slice(0, 10));
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState<FirMetadata>(() => firMetadata(report));

  useEffect(() => {
    setDate(report.date.slice(0, 10));
    setDocumentNo(report.documentNo);
    setMeta(firMetadata(report));
  }, [report.date, report.documentNo, report.metadata]);

  const pauseSave = useIdentitySavePaused();
  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly && !pauseSave,
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

  const setDocumentNoLive = (next: string) => {
    setDocumentNo(next);
    setReport((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof FirMetadata) => (next: string) => {
    setMeta((prev) => {
      const meta = { ...prev, [key]: next };
      setReport((r) => ({ ...r, metadata: meta }));
      return meta;
    });
  };
  const setDateLive = (next: string) => {
    setDate(next);
    set("dateOfNonConformance")(next);
    setReport((prev) => ({ ...prev, date: next }));
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Identity fields print in the R01 header. The assistant searches
            attachments and can fill unset fields.
          </p>
          {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="fir-source-doc-no"
            fieldKey="documentNo"
            label="Source Document No."
            value={documentNo}
            placeholder="ERF/26/022"
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="fir-date"
            fieldKey="date"
            type="date"
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
            placeholder="r-Insulin Glargine"
            disabled={readOnly}
            onChange={set("productName")}
          />
          <IdentityField
            id="fir-batch"
            fieldKey="batchNo"
            label="Batch No."
            value={meta.batchNo}
            placeholder="RIG25014"
            disabled={readOnly}
            onChange={set("batchNo")}
          />
          <IdentityField
            id="fir-equipment-id"
            fieldKey="equipmentId"
            label="Equipment ID"
            value={meta.equipmentId}
            placeholder="L-1901"
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
  const [documentNo, setDocumentNo] = useState(report.documentNo);
  const [meta, setMeta] = useState<QsrMetadata>(() =>
    qsrMetadataFrom(report.metadata)
  );

  useEffect(() => {
    setDocumentNo(report.documentNo);
    setMeta(qsrMetadataFrom(report.metadata));
  }, [report.documentNo, report.metadata]);

  const pauseSave = useIdentitySavePaused();
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

  const setDocumentNoLive = (next: string) => {
    setDocumentNo(next);
    setReport((prev) => ({ ...prev, documentNo: next }));
  };
  const set = (key: keyof QsrMetadata) => (next: string) => {
    setMeta((prev) => {
      const meta = { ...prev, [key]: next };
      setReport((r) => ({ ...r, metadata: meta }));
      return meta;
    });
  };

  return (
    <IdentityHeaderShell>
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            These fields print on the cover page and in every page header of
            QAD/016/F06-00.
          </p>
          {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityField
            id="qsr-equipment-name"
            fieldKey="equipmentName"
            label="Equipment / System"
            value={meta.equipmentName}
            placeholder="Glass Lined Reactor"
            disabled={readOnly}
            onChange={set("equipmentName")}
          />
          <IdentityField
            id="qsr-equipment-code"
            fieldKey="equipmentCode"
            label="Equipment Number"
            value={meta.equipmentCode}
            placeholder="GLR-1301"
            disabled={readOnly}
            onChange={set("equipmentCode")}
          />
          <IdentityField
            id="qsr-capacity"
            fieldKey="capacity"
            label="Capacity / Size"
            value={meta.capacity}
            placeholder="3.0 KL"
            disabled={readOnly}
            onChange={set("capacity")}
          />
          <IdentityField
            id="qsr-plant-section"
            fieldKey="plantSection"
            label="Section"
            value={meta.plantSection}
            placeholder="Production Block-A"
            disabled={readOnly}
            onChange={set("plantSection")}
          />
          <IdentityField
            id="qsr-report-no"
            fieldKey="documentNo"
            label="Report No."
            value={documentNo}
            placeholder="QSR/GLR-1301"
            disabled={readOnly}
            onChange={setDocumentNoLive}
          />
          <IdentityField
            id="qsr-revision"
            fieldKey="revision"
            label="Revision"
            value={meta.revision}
            placeholder="00"
            disabled={readOnly}
            onChange={set("revision")}
          />
          <IdentityField
            id="qsr-revision-description"
            fieldKey="revisionDescription"
            label="Revision description"
            value={meta.revisionDescription}
            placeholder="New Document"
            disabled={readOnly}
            onChange={set("revisionDescription")}
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
