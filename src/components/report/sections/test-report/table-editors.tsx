"use client";

import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { TEST_REPORT_SECTION_LABELS } from "@/lib/document-types/verification-test-report/sections";

type TableContent = { table: JSONContent };

function TestReportTableEditor({
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

export function TestReportSoftwareUnderTestEditor() {
  return (
    <TestReportTableEditor
      section="software_under_test"
      description="List each software version and the reason for that build."
      fieldLabel="Software under test"
    />
  );
}

export function TestReportRevisionHistoryEditor() {
  return (
    <TestReportTableEditor
      section="revision_history"
      description="Record document revisions with ECO/DCO and description."
      fieldLabel="Revision history"
    />
  );
}
