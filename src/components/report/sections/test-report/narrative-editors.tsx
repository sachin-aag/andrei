"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { TEST_REPORT_SECTION_LABELS } from "@/lib/document-types/verification-test-report/sections";

type NarrativeContent = { narrative: JSONContent };

function TestReportNarrativeEditor({
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
      title={
        TEST_REPORT_SECTION_LABELS[
          section as keyof typeof TEST_REPORT_SECTION_LABELS
        ] ?? section
      }
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

export function TestReportPurposeEditor() {
  return (
    <TestReportNarrativeEditor
      section="purpose"
      description="State why this verification activity is being performed."
      fieldLabel="Purpose"
      placeholder="State the purpose of this verification activity…"
    />
  );
}

export function TestReportScopeEditor() {
  return (
    <TestReportNarrativeEditor
      section="scope"
      description="Name the system configurations included in this verification."
      fieldLabel="Scope"
      placeholder="Name the system configurations under test…"
    />
  );
}

export function TestReportTestersDatesEditor() {
  return (
    <TestReportNarrativeEditor
      section="testers_dates"
      description="Record who executed the protocol and when."
      fieldLabel="Testers / Dates"
      placeholder="List testers and dates of execution…"
    />
  );
}

export function TestReportProblemResolutionEditor() {
  return (
    <TestReportNarrativeEditor
      section="problem_failure_resolution"
      description="Record problems or failures found during execution and how they were resolved."
      fieldLabel="Problem or Failure Resolution"
      placeholder="Describe problems or failures and their resolution…"
    />
  );
}

export function TestReportConclusionEditor() {
  return (
    <TestReportNarrativeEditor
      section="conclusion"
      description="State whether the design inputs in scope were verified."
      fieldLabel="Conclusion"
      placeholder="State whether design inputs were verified…"
    />
  );
}
