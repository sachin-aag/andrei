"use client";

import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function MeasureEditor() {
  const { updateSection } = useReport();
  const { status, lastSavedAt, value, flushSave } = useSectionSave("measure");

  return (
    <SectionShell
      title="Measure"
      description="Summarize the facts, data reviewed, and conclusion of analysis."
      status={status}
      lastSavedAt={lastSavedAt}
      section="measure"
    >
      <TiptapSectionField
        section="measure"
        contentPath="narrative"
        label="Measurement Narrative"
        placeholder="The equipment is installed in … SOP No. … is in place for … Include regulatory notification details if applicable."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) =>
          updateSection("measure", (p) => ({ ...p, narrative: doc }))
        }
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
