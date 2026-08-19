"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGenericReportSection, useReportData } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { getCustomerPack } from "@/lib/customers/packs";
import { CONVERGENT_DV_SECTION_LABELS } from "@/lib/document-types/convergent/sections";
import { DV_SECTION_LABELS } from "@/lib/document-types/design-verification/sections";

function editorTitle(section: string, override?: string): string {
  if (override) return override;
  return (
    DV_SECTION_LABELS[section as keyof typeof DV_SECTION_LABELS] ??
    CONVERGENT_DV_SECTION_LABELS[
      section as keyof typeof CONVERGENT_DV_SECTION_LABELS
    ] ??
    section
  );
}

type NarrativeContent = { narrative: JSONContent };

function DvNarrativeEditor({
  section,
  description,
  fieldLabel,
  placeholder,
  title,
}: {
  section: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
  title?: string;
}) {
  const { update } = useGenericReportSection<NarrativeContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as NarrativeContent | undefined) ?? {
    narrative: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title={editorTitle(section, title)}
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
  title,
}: {
  section: string;
  description: string;
  fieldLabel: string;
  title?: string;
}) {
  const { update } = useGenericReportSection<TableContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as TableContent | undefined) ?? {
    table: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title={editorTitle(section, title)}
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
  const convergent = getCustomerPack().id === "convergent";
  return (
    <DvNarrativeEditor
      section="deviations"
      title={convergent ? "Deviations" : undefined}
      description={
        convergent
          ? "Document deviations (or explicit none), impact, and disposition."
          : "Document protocol deviations, impact, disposition, and CAPA linkage."
      }
      fieldLabel="Deviations"
      placeholder={
        convergent
          ? "Document any deviations from the protocol, or state that there were none. Include impact and disposition…"
          : "Document any deviations from the approved protocol, impact assessments, dispositions for nonconforming results, and CAPA linkages…"
      }
    />
  );
}

export function DvConclusionEditor() {
  const convergent = getCustomerPack().id === "convergent";
  return (
    <DvNarrativeEditor
      section="conclusion"
      description={
        convergent
          ? "Overall outputs-meet-inputs or pass/fail statement, consistency with results, and open items."
          : "Overall and per-requirement met/not-met statements, open items, consistency with results."
      }
      fieldLabel="Conclusion"
      placeholder={
        convergent
          ? "State whether design outputs meet design inputs. Note residual risk or follow-ups with owners, or explicit none…"
          : "State whether design outputs meet design inputs overall and per requirement. List open items with owners…"
      }
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

export function DvPurposeEditor() {
  return (
    <DvNarrativeEditor
      section="purpose"
      description="State the verification objective, design outputs under test, and change references."
      fieldLabel="Purpose"
      placeholder="Describe the objective of the verification activity, the specific design outputs or software items under test, and any ECO/DCR or revision reference…"
    />
  );
}

export function DvScopeEditor() {
  return (
    <DvNarrativeEditor
      section="scope"
      description="Bound in-scope functions or units and state exclusions (or explicit none)."
      fieldLabel="Scope"
      placeholder="Bound the functions, units, or features in scope. State exclusions, or that nothing is excluded…"
    />
  );
}

type TestersDatesContent = {
  testers: JSONContent;
  startDate: string;
  endDate: string;
};

export function DvTestersDatesEditor() {
  const { readOnly } = useReportData();
  const { update } = useGenericReportSection<TestersDatesContent>("testers_dates");
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave("testers_dates");
  const content = (value as TestersDatesContent | undefined) ?? {
    testers: { type: "doc", content: [{ type: "paragraph" }] },
    startDate: "",
    endDate: "",
  };

  return (
    <SectionShell
      title="Testers & Dates"
      description="Name the testers and record start and end (or execution) dates."
      status={status}
      lastSavedAt={lastSavedAt}
      section="testers_dates"
    >
      <TiptapSectionField
        section="testers_dates"
        contentPath="testers"
        label="Testers"
        placeholder="Name testers and note role, qualification, or independence when relevant…"
        className="grid gap-2"
        value={content.testers}
        onChange={(doc) => update((p) => ({ ...p, testers: doc }))}
        onFlushSave={flushSave}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="dv-testers-start">Start date</Label>
          <Input
            id="dv-testers-start"
            type="date"
            value={content.startDate}
            disabled={readOnly}
            onChange={(e) =>
              update((p) => ({ ...p, startDate: e.target.value }))
            }
            onBlur={() => void flushSave()}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-testers-end">End date</Label>
          <Input
            id="dv-testers-end"
            type="date"
            value={content.endDate}
            disabled={readOnly}
            onChange={(e) => update((p) => ({ ...p, endDate: e.target.value }))}
            onBlur={() => void flushSave()}
          />
        </div>
      </div>
    </SectionShell>
  );
}

export function DvMethodsOfMeasurementEditor() {
  return (
    <DvNarrativeEditor
      section="methods_of_measurement"
      description="Describe each method, predefined acceptance criteria, environment, and how data are recorded."
      fieldLabel="Methods of Measurement"
      placeholder="Describe each measurement or test method, acceptance criteria, environment/configuration/software version, and how results are captured…"
    />
  );
}

export function DvTestEquipmentEditor() {
  return (
    <DvTableEditor
      section="test_equipment"
      description="Keep the seeded columns. Add one row per instrument, including CD asset tag / serial and calibration due date."
      fieldLabel="Test Equipment"
    />
  );
}

type ResultsContent = { narrative: JSONContent; table: JSONContent };

export function DvResultsAndDiscussionsEditor() {
  const { update } = useGenericReportSection<ResultsContent>(
    "results_and_discussions"
  );
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(
    "results_and_discussions"
  );
  const content = (value as ResultsContent | undefined) ?? {
    narrative: { type: "doc", content: [{ type: "paragraph" }] },
    table: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title="Results and Discussions"
      description="Requirement matrix with P/F, plus narrative discussion of outcomes."
      status={status}
      lastSavedAt={lastSavedAt}
      section="results_and_discussions"
    >
      <TiptapSectionField
        section="results_and_discussions"
        contentPath="narrative"
        label="Discussion"
        placeholder="Discuss outcomes, especially any failures, and how they relate to the requirements…"
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section="results_and_discussions"
        contentPath="table"
        label="Results matrix"
        placeholder="Use the table toolbar to add rows. Keep the header columns unchanged."
        className="grid gap-2"
        value={content.table}
        onChange={(doc) => update((p) => ({ ...p, table: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function DvProblemsResolutionEditor() {
  return (
    <DvNarrativeEditor
      section="problems_resolution"
      description="Address every Fail with cause, corrective action, and retest — or state that none remain."
      fieldLabel="Problems or Failure Resolution"
      placeholder="For each failure: cause, corrective action, and retest/verification. If all results passed, state that there were no open failures…"
    />
  );
}
