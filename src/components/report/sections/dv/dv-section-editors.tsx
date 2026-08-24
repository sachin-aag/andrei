"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
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
          ? "One paragraph per execution. Walk supported build history and close with 'deemed acceptable for release'."
          : "Overall and per-requirement met/not-met statements, open items, consistency with results."
      }
      fieldLabel="Conclusion"
      placeholder={
        convergent
          ? "Revision [letter] of this report contains results from [protocol] that was [fully/partially] executed on [configurations] to test [software version]. … has been deemed acceptable for release."
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
      description="Four paragraphs. Omit paragraph 2 if this is a single full execution. End with the VCS bullets and build-number explanation."
      fieldLabel="Purpose"
      placeholder="This revision presents results of the [full/partial] execution of [protocol number Rev. X] used to test [software version] ([CUS/document]) for [release type]. This build was designed to…"
    />
  );
}

export function DvScopeEditor() {
  return (
    <DvNarrativeEditor
      section="scope"
      description="Two packed paragraphs plus a Software Under Test table (version | reason for build), segregated by test-plan revision."
      fieldLabel="Scope"
      placeholder="This test report applies to [product] for system configurations [TOP IDs]…. Then the Software Under Test table: version | reason for build."
    />
  );
}

type TestersDatesContent = {
  testers: JSONContent;
};

export function DvTestersDatesEditor() {
  const { update } = useGenericReportSection<TestersDatesContent>("testers_dates");
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave("testers_dates");
  const content = (value as TestersDatesContent | undefined) ?? {
    testers: { type: "doc", content: [{ type: "paragraph" }] },
  };

  return (
    <SectionShell
      title="Testers/Dates"
      description="One block per test-plan revision. Name testers (title and affiliation) and write calendar start/end dates in the same narrative."
      status={status}
      lastSavedAt={lastSavedAt}
      section="testers_dates"
    >
      <TiptapSectionField
        section="testers_dates"
        contentPath="testers"
        label="Testers/Dates"
        placeholder="Testing per [test plan] Rev. [letter]: All testing was performed by [names, titles, affiliation] between [start] and [end]."
        className="grid gap-2"
        value={content.testers}
        onChange={(doc) => update((p) => ({ ...p, testers: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function DvMethodsOfMeasurementEditor() {
  return (
    <DvNarrativeEditor
      section="methods_of_measurement"
      description="Per execution: Executed Protocol, Protocol Modifications, and Units Under Test. Keep the equipment table in Test Equipment."
      fieldLabel="Methods of Measurement"
      placeholder="Testing per [test plan] Rev. [letter]: Executed Protocol — Full/Partial execution of [protocol] Rev. [letter]. Protocol Modifications — …. Units Under Test (UUTs) — …"
    />
  );
}

export function DvTestEquipmentEditor() {
  return (
    <DvTableEditor
      section="test_equipment"
      description="Lead-in sentence plus the seeded columns. One table per execution; systems under test first, then instruments."
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
      title="Results and Discussion"
      description="Discussion outline (Data Collection Forms, Requirements Verified, Observations) plus the four-column matrix for a partial execution."
      status={status}
      lastSavedAt={lastSavedAt}
      section="results_and_discussions"
    >
      <TiptapSectionField
        section="results_and_discussions"
        contentPath="narrative"
        label="Discussion"
        placeholder="Testing per [test plan] Rev. [letter]. Data Collection Forms: appendix. Requirements Verified: … Observations: …"
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
      description="Summarise the regression-round arc (builds, configurations, results, final version). Deviation detail stays in Deviations."
      fieldLabel="Problem or Failure Resolution"
      placeholder="During the initial [full/partial] execution of [software version] on [configurations], there were [n] deviations…. A new version [x.y.z] was generated and retested on…"
    />
  );
}
