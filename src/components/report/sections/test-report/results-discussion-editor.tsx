"use client";

import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { ProtocolRequirementsVerifiedTable } from "@/components/report/sections/protocol/requirements-verified-view";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  asTestReportResults,
  type TestReportResultsSection,
} from "@/lib/document-types/verification-test-report/sections";

export function TestReportResultsDiscussionEditor() {
  const { update } = useGenericReportSection<TestReportResultsSection>(
    "results_discussion"
  );
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave("results_discussion");
  const content = asTestReportResults(value);

  return (
    <SectionShell
      title="Results and Discussion"
      description="Requirements Verified is generated from the ledger. There is no pass/fail column."
      status={status}
      lastSavedAt={lastSavedAt}
      section="results_discussion"
    >
      <div className="grid gap-6">
        <ProtocolRequirementsVerifiedTable />
        <TiptapSectionField
          section="results_discussion"
          contentPath="observations"
          label="Observations"
          placeholder="Record observations from execution. Do not type a pass/fail matrix here."
          className="grid gap-2"
          value={content.observations}
          onChange={(doc) =>
            update((prev) => ({
              ...asTestReportResults(prev),
              observations: doc,
            }))
          }
          onFlushSave={flushSave}
        />
      </div>
    </SectionShell>
  );
}
