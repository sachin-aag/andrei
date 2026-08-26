"use client";

import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  QRA_SECTION_LABELS,
  type QraApproachSection,
  type QraPeriodicReviewSection,
  type QraSectionKey,
  type QraYesNo,
} from "@/lib/document-types/qra/sections";
import { recalculateFmeaTable } from "@/lib/document-types/qra/recalculate-table";
import {
  QUALITATIVE_RUBRIC,
  QUANTITATIVE_RUBRIC,
  parseYesNo,
  selectAssessmentMode,
  type AssessmentMode,
} from "@/lib/document-types/qra/scoring";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function label(section: QraSectionKey): string {
  return QRA_SECTION_LABELS[section];
}

const TABLE_PLACEHOLDER =
  "Use the table toolbar to add rows. Keep the header columns unchanged.";

type NarrativeContent = { narrative: JSONContent };

function NarrativeEditor({
  section,
  fieldLabel,
  placeholder,
}: {
  section: QraSectionKey;
  fieldLabel: string;
  placeholder: string;
}) {
  const { update } = useGenericReportSection<NarrativeContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as NarrativeContent | undefined) ?? {
    narrative: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label={fieldLabel}
        placeholder={placeholder}
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

type NarrativeTableContent = { narrative: JSONContent; table: JSONContent };

function NarrativeTableEditor({
  section,
  narrativeLabel,
  narrativePlaceholder,
  tableLabel,
}: {
  section: QraSectionKey;
  narrativeLabel: string;
  narrativePlaceholder: string;
  tableLabel: string;
}) {
  const { update } = useGenericReportSection<NarrativeTableContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as NarrativeTableContent | undefined) ?? {
    narrative: EMPTY_DOC,
    table: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label={narrativeLabel}
        placeholder={narrativePlaceholder}
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section={section}
        contentPath="table"
        label={tableLabel}
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

type TableContent = { table: JSONContent };

function TableEditor({
  section,
  fieldLabel,
}: {
  section: QraSectionKey;
  fieldLabel: string;
}) {
  const { update } = useGenericReportSection<TableContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as TableContent | undefined) ?? { table: EMPTY_DOC };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath="table"
        label={fieldLabel}
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

function YesNo({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: QraYesNo;
  disabled: boolean;
  onChange: (next: QraYesNo) => void;
}) {
  return (
    <div className="flex gap-4">
      {(["yes", "no"] as const).map((option) => (
        <label key={option} className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          {option === "yes" ? "Yes" : "No"}
        </label>
      ))}
    </div>
  );
}

export function QraApproachEditor() {
  const section: QraSectionKey = "qra_approach";
  const { update } = useGenericReportSection<QraApproachSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as QraApproachSection | undefined) ?? {
    impactKnown: "",
    scopeDefined: "",
    scopeNarrow: "",
    assessmentMode: "",
    narrative: EMPTY_DOC,
  };

  const setAnswer = (field: keyof QraApproachSection, next: QraYesNo) => {
    update((prev) => {
      const merged = { ...prev, [field]: next };
      const impact = parseYesNo(merged.impactKnown);
      const defined = parseYesNo(merged.scopeDefined);
      const narrow = parseYesNo(merged.scopeNarrow);
      const assessmentMode: AssessmentMode | "" =
        impact != null && defined != null && narrow != null
          ? selectAssessmentMode({
              impactKnown: impact,
              scopeDefined: defined,
              scopeNarrow: narrow,
            })
          : "";
      return { ...merged, assessmentMode };
    });
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        A02 / F01: Yes to all three → qualitative (informal). No to any →
        quantitative (formal).
      </p>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label>
            Is there potential impact on product quality, or is the GMP system
            known and understood?
          </Label>
          <YesNo
            name="qra-impact"
            value={content.impactKnown}
            disabled={readOnly}
            onChange={(next) => setAnswer("impactKnown", next)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Is the scope well defined?</Label>
          <YesNo
            name="qra-scope-defined"
            value={content.scopeDefined}
            disabled={readOnly}
            onChange={(next) => setAnswer("scopeDefined", next)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Is the scope narrow?</Label>
          <YesNo
            name="qra-scope-narrow"
            value={content.scopeNarrow}
            disabled={readOnly}
            onChange={(next) => setAnswer("scopeNarrow", next)}
          />
        </div>
        <p className="text-sm">
          Recorded mode:{" "}
          <span className="font-medium">
            {content.assessmentMode || "answer all three questions"}
          </span>
        </p>
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Notes"
        placeholder="Optional notes on why this assessment is informal or formal."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

function ScoringLegend({ mode }: { mode: AssessmentMode }) {
  if (mode === "quantitative") {
    return (
      <div className="rounded-md border border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">
        <p className="mb-1 font-medium text-[var(--foreground)]">
          Quantitative (RPN = S × P × D). Low 1–8, Medium 9–24, High 25–125.
        </p>
        <ul className="list-disc space-y-0.5 pl-4">
          {QUANTITATIVE_RUBRIC.map((row) => (
            <li key={row.score}>
              {row.score}: S {row.severity}; P {row.probability}; D{" "}
              {row.detectability}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">
      <p className="mb-1 font-medium text-[var(--foreground)]">
        Qualitative RPR lookup (not a product). High detectability = no
        detection possible.
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {(["low", "medium", "high"] as const).map((level) => {
          const row = QUALITATIVE_RUBRIC[level];
          const heading = level[0].toUpperCase() + level.slice(1);
          return (
            <li key={level}>
              {heading}: S {row.severity}; P {row.probability}; D{" "}
              {row.detectability}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FmeaLikeEditor({
  section,
  tableLabel,
  narrativePlaceholder,
}: {
  section: "qra_fmea" | "qra_residual_risk";
  tableLabel: string;
  narrativePlaceholder: string;
}) {
  const { update } = useGenericReportSection<NarrativeTableContent>(section);
  const { value: approachValue } = useGenericReportSection<QraApproachSection>(
    "qra_approach"
  );
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as NarrativeTableContent | undefined) ?? {
    narrative: EMPTY_DOC,
    table: EMPTY_DOC,
  };
  const approach = approachValue;
  const mode: AssessmentMode =
    approach?.assessmentMode === "qualitative" ? "qualitative" : "quantitative";

  const recalculate = () => {
    const result = recalculateFmeaTable(content.table, mode);
    update((p) => ({ ...p, table: result.doc }));
    if (result.errors.length > 0) {
      toast.error(result.errors[0] ?? "Could not recalculate");
      return;
    }
    toast.success("Risk scores recalculated");
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <ScoringLegend mode={mode} />
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Lead-in"
        placeholder={narrativePlaceholder}
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          Fill S, P and D. Leave RPN/RPR and Yes/No blank, then recalculate.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={recalculate}
        >
          Recalculate risk scores
        </Button>
      </div>
      <TiptapSectionField
        section={section}
        contentPath="table"
        label={tableLabel}
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function QraPeriodicReviewEditor() {
  const section: QraSectionKey = "qra_periodic_review";
  const { update } = useGenericReportSection<QraPeriodicReviewSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as QraPeriodicReviewSection | undefined) ?? {
    applicable: "",
    narrative: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-1">
        <Label>
          Are the identified risks applicable for periodic review?
        </Label>
        <YesNo
          name="qra-periodic"
          value={content.applicable}
          disabled={readOnly}
          onChange={(next) => update((p) => ({ ...p, applicable: next }))}
        />
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Justification / next review"
        placeholder="If No: temporary changes are not periodically reviewed. If Yes: next review date or trigger."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function QraObjectiveEditor() {
  return (
    <NarrativeEditor
      section="qra_objective"
      fieldLabel="Objective"
      placeholder="The objective of this document is to perform quality risk management and evaluation of controls for risk associated with [equipment / process / activity] and to identify potential risk and a mitigation plan."
    />
  );
}

export function QraScopeEditor() {
  return (
    <NarrativeEditor
      section="qra_scope"
      fieldLabel="Scope"
      placeholder="This risk assessment is applicable to [equipment / process / activity] in the Drug Product Facility of M.J. Biopharm Pvt. Ltd. Pune."
    />
  );
}

export function QraOverviewEditor() {
  return (
    <NarrativeEditor
      section="qra_overview"
      fieldLabel="Overview"
      placeholder="Brief description of the system/equipment/instrument: functions, intended use, related components, process flow (if any)."
    />
  );
}

export function QraProcedureEditor() {
  return (
    <NarrativeEditor
      section="qra_procedure"
      fieldLabel="Procedure"
      placeholder="Define the risk question, assemble background information, identify a leader and resources, specify timeline and decision level. Follow the site QRM flow chart (A01)."
    />
  );
}

export function QraTeamEditor() {
  return <TableEditor section="qra_team" fieldLabel="Risk assessment team" />;
}

export function QraRiskIdentificationEditor() {
  return (
    <TableEditor
      section="qra_risk_identification"
      fieldLabel="Identified process / activity and failure"
    />
  );
}

export function QraFmeaEditor() {
  return (
    <FmeaLikeEditor
      section="qra_fmea"
      tableLabel="FMEA grid"
      narrativePlaceholder="Potential failures considering current control and detection measures."
    />
  );
}

export function QraCommunicationEditor() {
  return (
    <NarrativeTableEditor
      section="qra_communication"
      narrativeLabel="Communication"
      tableLabel="Communication of mitigation proposals"
      narrativePlaceholder="Identified risk and mitigation plan communicated within cross-functional departments, with responsibility and target completion date."
    />
  );
}

export function QraPreConclusionEditor() {
  return (
    <NarrativeEditor
      section="qra_pre_conclusion"
      fieldLabel="Summary and conclusion (before implementation)"
      placeholder="Summarise the assessment outcome, including whether mitigation is required, before the plan is implemented."
    />
  );
}

export function QraMitigationEditor() {
  return (
    <NarrativeTableEditor
      section="qra_mitigation"
      narrativeLabel="Mitigation plan"
      tableLabel="Mitigation closure"
      narrativePlaceholder="Recommended action, responsible person, and expected target date. Close each item after verification."
    />
  );
}

export function QraResidualRiskEditor() {
  return (
    <FmeaLikeEditor
      section="qra_residual_risk"
      tableLabel="New / residual risk (F04)"
      narrativePlaceholder="Leave empty if no new risk arose during execution. Otherwise score new rows the same way as the FMEA grid."
    />
  );
}

export function QraPostConclusionEditor() {
  return (
    <NarrativeEditor
      section="qra_post_conclusion"
      fieldLabel="Summary and conclusion (after implementation)"
      placeholder="After mitigation, state whether remaining risk is acceptable."
    />
  );
}

export function QraRevisionHistoryEditor() {
  return (
    <TableEditor section="qra_revision_history" fieldLabel="Revision history" />
  );
}
