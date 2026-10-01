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
  FIR_BATCH_DISPOSITION_LABELS,
  FIR_BATCH_DISPOSITIONS,
  FIR_INVESTIGATION_TOOL_LABELS,
  FIR_INVESTIGATION_TOOLS,
  FIR_RESULTS_STATUS_LABELS,
  FIR_RESULTS_STATUSES,
  FIR_ROOT_CAUSE_CLASSIFICATION_LABELS,
  FIR_ROOT_CAUSE_CLASSIFICATIONS,
  FIR_ROOT_CAUSE_GROUP_LABELS,
  FIR_ROOT_CAUSE_GROUPS,
  FIR_SECTION_LABELS,
  type FirBatchDisposition,
  type FirBatchDispositionSection,
  type FirHumanErrorSection,
  type FirImpactAssessmentSection,
  type FirInvestigationTool,
  type FirInvestigationToolsSection,
  type FirResultsStatus,
  type FirRootCauseClassification,
  type FirRootCauseGroup,
  type FirRootCauseSection,
  type FirSectionKey,
} from "@/lib/document-types/fir/sections";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function label(section: FirSectionKey): string {
  return FIR_SECTION_LABELS[section];
}

const TABLE_PLACEHOLDER =
  "Use the table toolbar to add rows. Keep the header columns unchanged.";

// ------------------------------------------------------------ generic shapes

type NarrativeContent = { narrative: JSONContent };

function NarrativeEditor({
  section,
  fieldLabel,
  placeholder,
}: {
  section: FirSectionKey;
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
  section: FirSectionKey;
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
  section: FirSectionKey;
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

// --------------------------------------------------------------- form controls

function CheckboxRow<T extends string>({
  name,
  options,
  labels,
  selected,
  disabled,
  onToggle,
}: {
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  disabled: boolean;
  onToggle: (option: T, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => (
        <label
          key={option}
          className="flex items-center gap-1.5 text-sm"
          htmlFor={`${name}-${option}`}
        >
          <input
            id={`${name}-${option}`}
            type="checkbox"
            checked={selected.includes(option)}
            disabled={disabled}
            onChange={(e) => onToggle(option, e.target.checked)}
          />
          {labels[option]}
        </label>
      ))}
    </div>
  );
}

function RadioRow<T extends string>({
  name,
  options,
  labels,
  value,
  disabled,
  onChange,
}: {
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | "";
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => (
        <label
          key={option}
          className="flex items-center gap-1.5 text-sm"
          htmlFor={`${name}-${option}`}
        >
          <input
            id={`${name}-${option}`}
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          {labels[option]}
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ narrative sections

export function FirEventDescriptionEditor() {
  return (
    <NarrativeEditor
      section="fir_event_description"
      fieldLabel="Non-conformance description / description of event"
      placeholder="Date, batch, equipment, parameter, observed value against the acceptance limit, and who reported it. State the duration one way and keep it consistent."
    />
  );
}

export function FirStandardProceduresEditor() {
  return (
    <NarrativeEditor
      section="fir_standard_procedures"
      fieldLabel="Standard procedures"
      placeholder="Quote the acceptance criterion and cite the approved document that sets it, with revision."
    />
  );
}

export function FirImmediateActionEditor() {
  return (
    <NarrativeEditor
      section="fir_immediate_action"
      fieldLabel="Immediate action taken (if any)"
      placeholder="What was done at the time, by whom, and whether the parameter returned within limits."
    />
  );
}

export function FirInitialImpactEditor() {
  return (
    <NarrativeEditor
      section="fir_initial_impact"
      fieldLabel="Initial impact assessment"
      placeholder="The impact assessed when the event was raised — before the full investigation. Name what was considered: product, process, equipment, documentation, personnel safety, other batches."
    />
  );
}

export function FirInvestigationDetailsEditor() {
  return (
    <NarrativeEditor
      section="fir_investigation_details"
      fieldLabel="Investigation details"
      placeholder="For each candidate cause: what was checked, what was found, ruled in or out, and the record that supports it. Say so explicitly where a link depends on a quantity nobody measured."
    />
  );
}

export function FirScopeAssessmentEditor() {
  return (
    <NarrativeEditor
      section="fir_scope_assessment"
      fieldLabel="Scope assessment"
      placeholder="Which other batches were checked, what was found in each, and whether the event is isolated or recurring."
    />
  );
}

export function FirCorrectionEditor() {
  return (
    <NarrativeEditor
      section="fir_correction"
      fieldLabel="Correction details"
      placeholder="What corrected this occurrence — distinct from the corrective action that stops the cause recurring."
    />
  );
}

// --------------------------------------------------------------- table sections

export function FirInvestigationTeamEditor() {
  return (
    <TableEditor
      section="fir_investigation_team"
      fieldLabel="Investigation team"
    />
  );
}

export function FirChronologyEditor() {
  return (
    <NarrativeTableEditor
      section="fir_chronology"
      narrativeLabel="Summary"
      narrativePlaceholder="Optional lead-in to the timeline."
      tableLabel="Chronology of the event"
    />
  );
}

export function FirHistoricReviewEditor() {
  return (
    <NarrativeTableEditor
      section="fir_historic_review"
      narrativeLabel="Inference"
      narrativePlaceholder="Whether the prior CAPAs held, and whether this event is a recurrence."
      tableLabel="Historical data compilation table"
    />
  );
}

export function FirCorrectiveActionEditor() {
  return (
    <NarrativeTableEditor
      section="fir_corrective_action"
      narrativeLabel="Summary"
      narrativePlaceholder="Optional lead-in to the corrective actions."
      tableLabel="Corrective action"
    />
  );
}

export function FirInterimControlEditor() {
  return (
    <NarrativeTableEditor
      section="fir_interim_control"
      narrativeLabel="Summary"
      narrativePlaceholder="What covers the period until the actions close — or state that no interim control is required."
      tableLabel="Interim control"
    />
  );
}

export function FirPreventiveActionEditor() {
  return (
    <NarrativeTableEditor
      section="fir_preventive_action"
      narrativeLabel="Summary"
      narrativePlaceholder="Optional lead-in to the preventive actions."
      tableLabel="Preventive action"
    />
  );
}

export function FirCapaEffectivenessEditor() {
  return (
    <TableEditor
      section="fir_capa_effectiveness"
      fieldLabel="CAPA effectiveness check"
    />
  );
}

export function FirAttachmentsEditor() {
  return (
    <TableEditor section="fir_attachments" fieldLabel="List of attachments" />
  );
}

// ----------------------------------------------------------- form-field sections

export function FirInvestigationToolsEditor() {
  const section: FirSectionKey = "fir_investigation_tools";
  const { update } = useGenericReportSection<FirInvestigationToolsSection>(
    section
  );
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as FirInvestigationToolsSection | undefined) ?? {
    tools: [],
    narrative: EMPTY_DOC,
  };

  const toggle = (tool: FirInvestigationTool, checked: boolean) => {
    update((prev) => {
      const current = prev.tools ?? [];
      return {
        ...prev,
        tools: checked
          ? current.includes(tool)
            ? current
            : [...current, tool]
          : current.filter((t) => t !== tool),
      };
    });
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-2">
        <Label>Investigation tools assigned</Label>
        <CheckboxRow
          name="fir-tools"
          options={FIR_INVESTIGATION_TOOLS}
          labels={FIR_INVESTIGATION_TOOL_LABELS}
          selected={content.tools ?? []}
          disabled={readOnly}
          onToggle={toggle}
        />
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Other tools (if any)"
        placeholder="Anything not on the list above. This adds to the selection; it does not replace it."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function FirRootCauseEditor() {
  const section: FirSectionKey = "fir_root_cause";
  const { update } = useGenericReportSection<FirRootCauseSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as FirRootCauseSection | undefined) ?? {
    classification: "",
    groups: [],
    narrative: EMPTY_DOC,
  };

  const toggleGroup = (group: FirRootCauseGroup, checked: boolean) => {
    update((prev) => {
      const current = prev.groups ?? [];
      // "No Root Cause" is exclusive — selecting it clears the 6M categories.
      if (checked && group === "no_root_cause") {
        return { ...prev, groups: ["no_root_cause"] };
      }
      const next = checked
        ? [...current.filter((g) => g !== "no_root_cause"), group]
        : current.filter((g) => g !== group);
      return { ...prev, groups: next };
    });
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-2">
        <Label>Root cause classification</Label>
        <RadioRow
          name="fir-root-cause-classification"
          options={FIR_ROOT_CAUSE_CLASSIFICATIONS}
          labels={FIR_ROOT_CAUSE_CLASSIFICATION_LABELS}
          value={
            (content.classification as FirRootCauseClassification | "") ?? ""
          }
          disabled={readOnly}
          onChange={(next) => update((p) => ({ ...p, classification: next }))}
        />
      </div>
      <div className="grid gap-2">
        <Label>Root cause identification group</Label>
        <CheckboxRow
          name="fir-root-cause-group"
          options={FIR_ROOT_CAUSE_GROUPS}
          labels={FIR_ROOT_CAUSE_GROUP_LABELS}
          selected={content.groups ?? []}
          disabled={readOnly}
          onToggle={toggleGroup}
        />
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Root cause description"
        placeholder="Distinguish the root cause from contributing factors. Do not name a cause the investigation never examined."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function FirHumanErrorEditor() {
  const section: FirSectionKey = "fir_human_error";
  const { update } = useGenericReportSection<FirHumanErrorSection>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as FirHumanErrorSection | undefined) ?? {
    applicable: "",
    table: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-2">
        <Label>Does human error evaluation apply?</Label>
        <RadioRow
          name="fir-human-error-applicable"
          options={["yes", "no"] as const}
          labels={{ yes: "Yes", no: "Not applicable" }}
          value={content.applicable ?? ""}
          disabled={readOnly}
          onChange={(next) => update((p) => ({ ...p, applicable: next }))}
        />
      </div>
      {content.applicable === "yes" ? (
        <TiptapSectionField
          section={section}
          contentPath="table"
          label="Human error evaluation"
          placeholder={TABLE_PLACEHOLDER}
          className="grid gap-2"
          value={content.table}
          onChange={(doc) => update((p) => ({ ...p, table: doc }))}
          onFlushSave={flushSave}
        />
      ) : null}
    </SectionShell>
  );
}

export function FirImpactAssessmentEditor() {
  const section: FirSectionKey = "fir_impact_assessment";
  const { update } = useGenericReportSection<FirImpactAssessmentSection>(
    section
  );
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as FirImpactAssessmentSection | undefined) ?? {
    resultsStatus: "",
    narrative: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-2">
        <Label>Analytical results supporting this assessment</Label>
        <RadioRow
          name="fir-results-status"
          options={FIR_RESULTS_STATUSES}
          labels={FIR_RESULTS_STATUS_LABELS}
          value={(content.resultsStatus as FirResultsStatus | "") ?? ""}
          disabled={readOnly}
          onChange={(next) => update((p) => ({ ...p, resultsStatus: next }))}
        />
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Impact assessment"
        placeholder="Give values against acceptance criteria, not 'within range'. Cover product, process, equipment and other batches."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function FirBatchDispositionEditor() {
  const section: FirSectionKey = "fir_batch_disposition";
  const { update } = useGenericReportSection<FirBatchDispositionSection>(
    section
  );
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as FirBatchDispositionSection | undefined) ?? {
    disposition: "",
    narrative: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <div className="grid gap-2">
        <Label>Batch disposition</Label>
        <RadioRow
          name="fir-batch-disposition"
          options={FIR_BATCH_DISPOSITIONS}
          labels={FIR_BATCH_DISPOSITION_LABELS}
          value={(content.disposition as FirBatchDisposition | "") ?? ""}
          disabled={readOnly}
          onChange={(next) => update((p) => ({ ...p, disposition: next }))}
        />
      </div>
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Justification"
        placeholder="Why the batch was dispositioned this way."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
