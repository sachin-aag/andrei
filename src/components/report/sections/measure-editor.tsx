"use client";

import { useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { CriteriaChecklist, SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { SECTION_GUIDANCE } from "@/lib/report-section-guidance";

export function MeasureEditor() {
  const { update } = useReportSection("measure");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("measure");

  return (
    <SectionShell
      title="Measure"
      description="Summarize the facts, data reviewed, and conclusion of analysis."
      status={status}
      lastSavedAt={lastSavedAt}
      section="measure"
    >
      <CriteriaChecklist items={SECTION_GUIDANCE.measure ?? []} ordered />

      <TiptapSectionField
        section="measure"
        contentPath="narrative"
        label="Measurement Narrative"
        placeholder="The equipment is installed in … SOP No. … is in place for … Include regulatory notification details if applicable."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
