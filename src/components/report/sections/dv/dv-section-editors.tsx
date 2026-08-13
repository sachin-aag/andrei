"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { DV_SECTION_LABELS } from "@/lib/document-types/design-verification/sections";

type NarrativeContent = { narrative: JSONContent };

function DvNarrativeEditor({
  section,
  description,
  fieldLabel,
  placeholder,
}: {
  section: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
}) {
  const { update } = useGenericReportSection<NarrativeContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as NarrativeContent | undefined) ?? {
    narrative: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title={DV_SECTION_LABELS[section as keyof typeof DV_SECTION_LABELS] ?? section}
      description={description}
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

type TableContent = { table: JSONContent };

function DvTableEditor({
  section,
  description,
  fieldLabel,
}: {
  section: string;
  description: string;
  fieldLabel: string;
}) {
  const { update } = useGenericReportSection<TableContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as TableContent | undefined) ?? {
    table: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title={DV_SECTION_LABELS[section as keyof typeof DV_SECTION_LABELS] ?? section}
      description={description}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath="table"
        label={fieldLabel}
        placeholder="Use the table toolbar to add rows. Keep the header columns unchanged."
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function DvPurposeScopeEditor() {
  return (
    <DvNarrativeEditor
      section="purpose_scope"
      description="State the verification objective, design outputs under test, and change references."
      fieldLabel="Purpose & Scope"
      placeholder="Describe the objective of the verification activity, the specific design outputs/requirements under verification, and any ECO/DCR reference…"
    />
  );
}

export function DvReferencesEditor() {
  return (
    <DvNarrativeEditor
      section="references"
      description="Cite design inputs, applicable standards, and related protocols/SOPs."
      fieldLabel="References"
      placeholder="List design input documents by ID/revision, applicable standards, and related protocols or prior V&V reports…"
    />
  );
}

export function DvTraceabilityEditor() {
  return (
    <DvTableEditor
      section="traceability"
      description="Requirement-to-test matrix. Keep the seeded column headers; add one row per requirement."
      fieldLabel="Traceability Matrix"
    />
  );
}

export function DvTestMethodsEditor() {
  return (
    <DvNarrativeEditor
      section="test_methods"
      description="Describe methods, acceptance criteria, equipment, sample size, pre-approval, and environment."
      fieldLabel="Test Methods / Protocol Summary"
      placeholder="Describe each test method, pre-defined acceptance criteria, equipment/calibration, sample size rationale, protocol pre-approval, and test environment…"
    />
  );
}

export function DvTestResultsEditor() {
  return (
    <DvTableEditor
      section="test_results"
      description="Row-per-test results. Keep the seeded column headers."
      fieldLabel="Test Results"
    />
  );
}

export function DvDeviationsEditor() {
  return (
    <DvNarrativeEditor
      section="deviations"
      description="Document protocol deviations, impact, disposition, and CAPA linkage."
      fieldLabel="Deviations & Nonconformances"
      placeholder="Document any deviations from the approved protocol, impact assessments, dispositions for nonconforming results, and CAPA linkages…"
    />
  );
}

export function DvConclusionEditor() {
  return (
    <DvNarrativeEditor
      section="conclusion"
      description="Overall and per-requirement met/not-met statements, open items, consistency with results."
      fieldLabel="Conclusion"
      placeholder="State whether design outputs meet design inputs overall and per requirement. List open items with owners…"
    />
  );
}

export function DvApprovalEditor() {
  return (
    <DvNarrativeEditor
      section="approval_signoff"
      description="QA, RA, and engineering sign-offs with name, title, and date."
      fieldLabel="Approval / Sign-off"
      placeholder="Record QA, RA, and engineering/design owner sign-offs with name, title, and date…"
    />
  );
}

export function DvAppendicesEditor() {
  return (
    <DvNarrativeEditor
      section="appendices"
      description="Raw data, protocols, calibration certificates, and supporting evidence references."
      fieldLabel="Appendices"
      placeholder="Reference raw data locations, attached protocols, calibration certificates, and supporting evidence…"
    />
  );
}
