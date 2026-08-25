"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  MECHANICAL_DV_SECTION_LABELS,
  type MechanicalDvSectionKey,
} from "@/lib/document-types/mechanical/sections";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function label(section: MechanicalDvSectionKey): string {
  return MECHANICAL_DV_SECTION_LABELS[section];
}

const TABLE_PLACEHOLDER =
  "Use the table toolbar to add rows. Keep the header columns unchanged.";

/* ------------------------------------------------------------- narrative */

type NarrativeContent = { narrative: JSONContent };

function NarrativeEditor({
  section,
  fieldLabel,
  placeholder,
  description,
}: {
  section: MechanicalDvSectionKey;
  fieldLabel: string;
  placeholder: string;
  description?: string;
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

/* ------------------------------------------------------ narrative + table */

type NarrativeTableContent = { narrative: JSONContent; table: JSONContent };

function NarrativeTableEditor({
  section,
  narrativeLabel,
  narrativePlaceholder,
  tableLabel,
  description,
}: {
  section: MechanicalDvSectionKey;
  narrativeLabel: string;
  narrativePlaceholder: string;
  tableLabel: string;
  description?: string;
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
      description={description}
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

/* ----------------------------------------------------------------- table */

type TableContent = { table: JSONContent };

function TableEditor({
  section,
  fieldLabel,
  description,
}: {
  section: MechanicalDvSectionKey;
  fieldLabel: string;
  description?: string;
}) {
  const { update } = useGenericReportSection<TableContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as TableContent | undefined) ?? { table: EMPTY_DOC };

  return (
    <SectionShell
      title={label(section)}
      description={description}
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

/* ------------------------------------------------------------- sections */

export function MechPurposeEditor() {
  return (
    <NarrativeEditor
      section="purpose"
      fieldLabel="Purpose"
      placeholder="The purpose of this report is to present the testing results obtained following the [full/partial] executions of [system protocol] and [hardware protocol], respectively, which verified [assembly (PART-NO)], … for release on [product]. [Feature] enables …"
    />
  );
}

export function MechScopeEditor() {
  return (
    <NarrativeEditor
      section="scope"
      fieldLabel="Scope"
      placeholder="This test report applies to [product] and summarizes verification activities for system configurations defined as [TOP-…] and [TOP-…]. The [requirements document] ([number] Rev. [letter]) and [requirements document] ([number] Rev. [letter]) describes the scope of the requirements that were verified, which were tested in accordance with [test plan] ([number] Rev. [letter])."
    />
  );
}

export function MechTestersDatesEditor() {
  const section: MechanicalDvSectionKey = "testers_dates";
  const { update } = useGenericReportSection<{ testers: JSONContent }>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as { testers: JSONContent } | undefined) ?? {
    testers: EMPTY_DOC,
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
        contentPath="testers"
        label="Testers/Dates"
        placeholder="All testing was performed by [company] [title] [name] and [company] [title] [name] between the dates of [DD Month YYYY] and [DD Month YYYY]."
        className="grid gap-2"
        value={content.testers}
        onChange={(doc) => update((p) => ({ ...p, testers: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function MechExecutedProtocolEditor() {
  return (
    <NarrativeEditor
      section="executed_protocol"
      fieldLabel="Executed Protocol"
      description="One sentence. Full or partial, each protocol by number and revision."
      placeholder="[Full/Partial] executions of [number], Rev. [letter] and [number], Rev. [letter], respectively."
    />
  );
}

export function MechProtocolDeviationsEditor() {
  return (
    <NarrativeEditor
      section="protocol_deviations"
      fieldLabel="Protocol Deviations"
      description="Changes to the test method. A result that failed its requirement belongs in section 3."
      placeholder="Throughout the execution of the test protocol, the test engineers implemented [n words] ([n]) deviations to the protocol method to [reason]. All original approved deviation forms can be found attached at the end of the executed protocol in Appendix [letter] of this report."
    />
  );
}

export function MechUnitsUnderTestEditor() {
  return (
    <NarrativeTableEditor
      section="units_under_test"
      narrativeLabel="Units Under Test"
      tableLabel="Table 1. Units Under Test"
      description="Three paragraphs: system-to-UUT reconciliation, component assemblies, and the UUT datasheet pointer. Measurement instruments belong in 2.4."
      narrativePlaceholder="[N words] ([n]) [product] systems, [n] [config] systems and [n] [config] systems were required to complete testing. … [n] [assembly] ([PART-NO] Rev. [n]) … were required to complete testing. More details … are detailed in the Unit Under Test Datasheet in Section [n] of the executed [protocol] and section [n] of the [protocol], which are attached in Appendix [letter] of this report."
    />
  );
}

export function MechTestEquipmentEditor() {
  return (
    <NarrativeTableEditor
      section="equipment_and_calibration"
      narrativeLabel="Lead-in"
      tableLabel="Table 2. Test Equipment"
      description="One table covers both executions. The units under test belong in Table 1."
      narrativePlaceholder="The table below lists all equipment used for testing during the [full/partial] executions of the test protocols."
    />
  );
}

export function MechFailureFormsEditor() {
  return (
    <NarrativeEditor
      section="failure_forms"
      fieldLabel="Failure/Out of Specification Forms"
      description="A failure is a result that did not satisfy its requirement. Method changes belong in 2.2."
      placeholder={
        "There [was/were] [n words] ([n]) failure(s) encountered throughout the [full/partial] execution of the test protocol, [number] Rev. [letter]. The approved failure form is attached in Appendix [letter] of this report, following all completed datasheets. A summary of the failure is listed below.\n\nFailure #01:\nRequirement: [REQ-ID]\n[What was observed, the technical cause, and any related change record.]\n[Disposition: whether action is needed, and every document that will be corrected, by number.]"
      }
    />
  );
}

export function MechDataCollectionFormsEditor() {
  return (
    <NarrativeEditor
      section="data_collection_forms"
      fieldLabel="Data Collection Forms"
      placeholder="All completed data collection forms are attached in Appendix [letter] of this report. This includes datasheets specific to [protocol] ([number], Rev. [letter]) and [protocol] ([number], Rev. [letter]), respectively. [Any supplemental test case, and the report or observation that prompted it.]"
    />
  );
}

type RequirementsVerifiedContent = {
  narrative: JSONContent;
  hardwareTable: JSONContent;
  systemTable: JSONContent;
};

export function MechRequirementsVerifiedEditor() {
  const section: MechanicalDvSectionKey = "requirements_verified";
  const { update } =
    useGenericReportSection<RequirementsVerifiedContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content = (value as RequirementsVerifiedContent | undefined) ?? {
    narrative: EMPTY_DOC,
    hardwareTable: EMPTY_DOC,
    systemTable: EMPTY_DOC,
  };

  return (
    <SectionShell
      title={label(section)}
      description="Coverage is the test plan's requirement set, not the requirements document. Hardware first."
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath="narrative"
        label="Lead-in"
        placeholder="All requirements detailed in [test plan] ([number] Rev. [letter]) were verified during the [full/partial] executions of test protocols [number] Rev. [letter] and [number] Rev. [letter], respectively. See the tables below for a summary of results."
        className="grid gap-2"
        value={content.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section={section}
        contentPath="hardwareTable"
        label="Table 3. Hardware Requirement Results"
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.hardwareTable}
        onChange={(doc) => update((p) => ({ ...p, hardwareTable: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section={section}
        contentPath="systemTable"
        label="Table 4. System Requirement Results"
        placeholder={TABLE_PLACEHOLDER}
        className="grid gap-2"
        value={content.systemTable}
        onChange={(doc) => update((p) => ({ ...p, systemTable: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

export function MechObservationsEditor() {
  return (
    <NarrativeEditor
      section="observations"
      fieldLabel="Observations"
      description="One paragraph per observation, in the order they arose. Failures belong in section 3."
      placeholder="[When the observation was made], it was determined that … Refer to [design review / change record / deviation] for further details regarding this [scope change]. As a result, …"
    />
  );
}

export function MechProblemsResolutionEditor() {
  return (
    <NarrativeEditor
      section="problems_resolution"
      fieldLabel="Problem or Failure Resolution"
      description="One paragraph covering every failure. Restates and resolves — introduces no new facts."
      placeholder="There [was/were] [n words] ([n]) reported failure(s) that occurred during the execution of the test protocol, which [is/are] captured in Failure/Out of Specification Form No. [n]. … [Product limitation or test case error, and the protocol revision that introduced the test case.] [No] immediate action was required."
    />
  );
}

export function MechConclusionEditor() {
  return (
    <NarrativeEditor
      section="conclusion"
      fieldLabel="Conclusion"
      placeholder="This report summarizes the results from the [full/partial] executions of [protocols] ([number], Rev. [letter] and [number], Rev. [letter]), respectively, which verified [assemblies, named as in Purpose] for release on [product]. All testing was performed per [test plan] ([number] Rev. [letter]). … [feature] has been deemed acceptable for release on [product]."
    />
  );
}

export function MechRevisionHistoryEditor() {
  return (
    <TableEditor
      section="revision_history"
      fieldLabel="Table 5. Revision History"
      description="One row per revision, oldest at the top. Historical rows are never edited or removed."
    />
  );
}
