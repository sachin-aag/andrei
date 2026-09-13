"use client";

import type { JSONContent } from "@tiptap/core";
import { Label } from "@/components/ui/label";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  ELR_RECOMMENDATIONS,
  ELR_RECOMMENDATION_LABELS,
  ELR_RISK_GRADES,
  ELR_RISK_GRADE_LABELS,
  ELR_SECTION_LABELS,
  type ElrConclusionSection,
  type ElrRecommendation,
  type ElrRiskActionsSection,
  type ElrRiskGrade,
  type ElrSectionKey,
} from "@/lib/document-types/elr/sections";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function label(section: ElrSectionKey): string {
  return ELR_SECTION_LABELS[section];
}

const TABLE_PLACEHOLDER =
  "Use the table toolbar to add rows. Keep the header columns unchanged.";

const ASSESSMENT_PLACEHOLDER =
  "Interpret the table: counts, what happened, implication, what was done (CA / CAPA / deviation), and whether product was scrapped or runtime was lost. Suggest only actions that follow from these rows.";

type NarrativeContent = { narrative: JSONContent };

function NarrativeEditor({
  section,
  fieldLabel,
  placeholder,
}: {
  section: ElrSectionKey;
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
  hint,
}: {
  section: ElrSectionKey;
  narrativeLabel: string;
  narrativePlaceholder: string;
  tableLabel: string;
  hint?: string;
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
      {hint && (
        <p className="text-sm text-[var(--muted-foreground)]">{hint}</p>
      )}
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
  hint,
}: {
  section: ElrSectionKey;
  fieldLabel: string;
  hint?: string;
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
      {hint && (
        <p className="text-sm text-[var(--muted-foreground)]">{hint}</p>
      )}
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

type TrendContent = {
  narrative: JSONContent;
  table: JSONContent;
  trend: JSONContent;
};

/** Breakdowns and alarms: the event table plus a trend summary. */
function TrendEditor({
  section,
  narrativeLabel,
  narrativePlaceholder,
  tableLabel,
  trendLabel,
  trendPlaceholder,
}: {
  section: ElrSectionKey;
  narrativeLabel: string;
  narrativePlaceholder: string;
  tableLabel: string;
  trendLabel: string;
  trendPlaceholder: string;
}) {
  const { update } = useGenericReportSection<TrendContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as TrendContent | undefined) ?? {
    narrative: EMPTY_DOC,
    table: EMPTY_DOC,
    trend: EMPTY_DOC,
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
      <TiptapSectionField
        section={section}
        contentPath="trend"
        label={trendLabel}
        placeholder={trendPlaceholder}
        className="grid gap-2"
        value={content.trend}
        onChange={(doc) => update((p) => ({ ...p, trend: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function ElrObjectiveEditor() {
  return (
    <NarrativeEditor
      section="elr_objective"
      fieldLabel="Objective"
      placeholder="The objective of this report is to consolidate all activity on [equipment name, ID] since its last periodic re-qualification and to confirm whether the equipment remains in its qualified state."
    />
  );
}

export function ElrScopeEditor() {
  return (
    <NarrativeEditor
      section="elr_scope"
      fieldLabel="Scope"
      placeholder="This lifecycle report is applicable to [equipment name] bearing equipment number [E/PR/0NN] for the [vial / cartridge] format, installed in the Production department of the drug product facility at M.J. Biopharm Pvt. Limited, Pune, for the period [from] to [to]."
    />
  );
}

export function ElrResponsibilitiesEditor() {
  return (
    <NarrativeTableEditor
      section="elr_responsibilities"
      narrativeLabel="Responsibilities"
      tableLabel="Departments and responsibilities"
      narrativePlaceholder="Optional lead-in. The table carries the departmental responsibilities."
    />
  );
}

export function ElrAbbreviationsEditor() {
  return (
    <TableEditor
      section="elr_abbreviations"
      fieldLabel="Abbreviations"
      hint="Starter glossary — keep the terms this report actually uses and delete the rest."
    />
  );
}

export function ElrSystemDescriptionEditor() {
  return (
    <NarrativeEditor
      section="elr_system_description"
      fieldLabel="Equipment and system description"
      placeholder="Function, main stations or components, the associated computerized system, and any equipment sharing the same line or control system."
    />
  );
}

export function ElrQualificationEditor() {
  return (
    <NarrativeTableEditor
      section="elr_qualification"
      narrativeLabel="Assessment"
      tableLabel="Qualification and periodic re-qualification history"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} State whether the chain is unbroken and whether the next periodic re-qualification is due or overdue.`}
      hint="Cumulative for the life of the equipment — not limited to the ELR period. Mark every row Vial, Cartridge or Line-common."
    />
  );
}

export function ElrMediaFillEditor() {
  return (
    <NarrativeTableEditor
      section="elr_media_fill"
      narrativeLabel="Assessment"
      tableLabel="Media fill / aseptic process simulation"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} State whether the qualifying configuration for this format remains current and whether the required frequency per line and shift has been met.`}
    />
  );
}

export function ElrMonitoringEditor() {
  return (
    <NarrativeTableEditor
      section="elr_monitoring"
      narrativeLabel="Assessment"
      tableLabel="Monitoring records"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} Call out any excursion and its linked deviation.`}
      hint="Every row reporting an excursion must carry a linked deviation reference."
    />
  );
}

export function ElrCalibrationEditor() {
  return (
    <NarrativeTableEditor
      section="elr_calibration"
      narrativeLabel="Assessment"
      tableLabel="Associated instruments"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} Confirm no instrument is overdue at the cut-off date.`}
      hint="Instruments are the equipment ID prefix in the annual calibration planner (for example E/PR/070/…)."
    />
  );
}

export function ElrPreventiveMaintenanceEditor() {
  return (
    <NarrativeTableEditor
      section="elr_preventive_maintenance"
      narrativeLabel="Assessment"
      tableLabel="Preventive maintenance"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} State PM compliance (completed on schedule against planned) and note any checklist revision.`}
    />
  );
}

export function ElrBreakdownsEditor() {
  return (
    <TrendEditor
      section="elr_breakdowns"
      narrativeLabel="Assessment"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} Include downtime hours and whether a repeat failure lost runtime.`}
      tableLabel="Breakdown events"
      trendLabel="Breakdown trend summary"
      trendPlaceholder="Group recurring failure modes and state what recurrence implies for PM frequency, design change or re-qualification timing."
    />
  );
}

export function ElrQmsEditor() {
  return (
    <NarrativeTableEditor
      section="elr_qms"
      narrativeLabel="Assessment"
      tableLabel="Change control / deviation / CAPA / OOS / OOT"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} List open items separately from closed ones and explain why any change affecting the qualified state did or did not trigger a re-qualification.`}
      hint="Period runs from the last PRQ completion date to the ELR cut-off — not the rolling window."
    />
  );
}

export function ElrAlarmsEditor() {
  return (
    <TrendEditor
      section="elr_alarms"
      narrativeLabel="Assessment"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} Distinguish Direct Impact alarms from nuisance codes and say whether any lost runtime.`}
      tableLabel="Alarm records"
      trendLabel="Alarm trend summary"
      trendPlaceholder="Distinguish recurring or nuisance alarms from GMP-relevant ones, and state whether the trended alarm set still covers the equipment's direct-impact functions."
    />
  );
}

export function ElrAccessControlEditor() {
  return (
    <NarrativeTableEditor
      section="elr_access_control"
      narrativeLabel="Assessment"
      tableLabel="Access control"
      narrativePlaceholder="Separate initial qualification of access control (21 CFR Part 11) from what was verified this period: admin holders, privilege changes, leavers removed. Interpret the table counts."
      hint="Where the control system is shared across the line, scope to this equipment where the system permits and mark the remainder Line-common."
    />
  );
}

export function ElrAuditTrailEditor() {
  return (
    <NarrativeTableEditor
      section="elr_audit_trail"
      narrativeLabel="Assessment"
      tableLabel="Audit trail review"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} Review periods must cover the whole ELR period without a gap.`}
      hint="Any anomaly needs a deviation reference."
    />
  );
}

export function ElrCsvStatusEditor() {
  return (
    <NarrativeTableEditor
      section="elr_csv_status"
      narrativeLabel="Assessment"
      tableLabel="Validation status"
      narrativePlaceholder={`${ASSESSMENT_PLACEHOLDER} State when each system's periodic review was last performed. Mark Not Applicable explicitly if the equipment has no computerized system.`}
    />
  );
}

export function ElrDiscrepanciesEditor() {
  return (
    <NarrativeEditor
      section="elr_discrepancies"
      fieldLabel="Discrepancy / deviations observed while compiling this report"
      placeholder="State &ldquo;No discrepancy has been observed during compilation of this report&rdquo;, or describe each discrepancy — a record that could not be located, a reference that did not reconcile, an incomplete data set — with what was done about it."
    />
  );
}

export function ElrSystemTrendsEditor() {
  return (
    <NarrativeTableEditor
      section="elr_system_trends"
      narrativeLabel="System-level assessment"
      tableLabel="Recurring themes"
      narrativePlaceholder="Identify recurring themes that cut across sections — the same sensor, a PM alarm that is out of sync, a part that keeps failing. State downtime, uptime or availability for the period. Carry each theme that needs action into the risk-actions table."
      hint="This is a synthesis over the evidence sections, not a new inventory of records."
    />
  );
}

export function ElrRiskActionsEditor() {
  const section: ElrSectionKey = "elr_risk_actions";
  const { update } = useGenericReportSection<ElrRiskActionsSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as ElrRiskActionsSection | undefined) ?? {
    narrative: EMPTY_DOC,
    table: EMPTY_DOC,
    overallGrade: "",
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Prioritize by occurrence, frequency and severity. Product scrap and
        lost runtime are High. Around ten actions is a working size — do not
        list every event.
      </p>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Risk assessment"
        placeholder="Defend the overall grade from the action list. High-priority rows are the ones that scrapped product, lost runtime, or repeated."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <div className="grid gap-1.5">
        <Label>Overall report risk grading</Label>
        <div className="grid gap-1.5">
          {ELR_RISK_GRADES.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="elr-risk-grade"
                value={option}
                checked={content.overallGrade === option}
                disabled={readOnly}
                onChange={() =>
                  update((p) => ({
                    ...p,
                    overallGrade: option as ElrRiskGrade,
                  }))
                }
              />
              {ELR_RISK_GRADE_LABELS[option]}
            </label>
          ))}
        </div>
      </div>
      <TiptapSectionField
        section={section}
        contentPath="table"
        label="Prioritized actions"
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function ElrConclusionEditor() {
  const section: ElrSectionKey = "elr_conclusion";
  const { update } = useGenericReportSection<ElrConclusionSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as ElrConclusionSection | undefined) ?? {
    narrative: EMPTY_DOC,
    recommendation: "",
    recommendationNarrative: EMPTY_DOC,
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
        label="Summary and conclusion"
        placeholder="State whether the equipment remains in its qualified state for this container format, on the basis of the evidence sections above."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <div className="grid gap-1.5">
        <Label>Recommendation</Label>
        <div className="grid gap-1.5">
          {ELR_RECOMMENDATIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="elr-recommendation"
                value={option}
                checked={content.recommendation === option}
                disabled={readOnly}
                onChange={() =>
                  update((p) => ({
                    ...p,
                    recommendation: option as ElrRecommendation,
                  }))
                }
              />
              {ELR_RECOMMENDATION_LABELS[option]}
            </label>
          ))}
        </div>
      </div>
      <TiptapSectionField
        section={section}
        contentPath="recommendationNarrative"
        label="Justification"
        placeholder="Justify the recommendation, and specify it here when Other is selected."
        className="grid gap-2"
        value={content.recommendationNarrative}
        onChange={(doc) =>
          update((p) => ({ ...p, recommendationNarrative: doc }))
        }
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function ElrAttachmentsEditor() {
  return <TableEditor section="elr_attachments" fieldLabel="Attachments" />;
}

export function ElrRevisionHistoryEditor() {
  return (
    <TableEditor section="elr_revision_history" fieldLabel="Revision history" />
  );
}
