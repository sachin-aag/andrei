"use client";

import { useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function DefineEditor() {
  const { update } = useReportSection("define");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("define");

  return (
    <SectionShell
      title="Define"
      description="Describe what happened and the initial scope of the deviation."
      status={status}
      lastSavedAt={lastSavedAt}
      section="define"
    >
      <TiptapSectionField
        section="define"
        contentPath="narrative"
        label="Details of Investigation (Narrative)"
        placeholder="On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation at [location], it was observed that… Include: location of deviation, date/time of occurrence & detection, personnel involved, and initial scope."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
