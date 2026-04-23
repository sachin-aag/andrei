"use client";

import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

const CHECKS = [
  "Clearly define what happens actually",
  "Explain what is different than expected",
  "Mention the location where the deviation has occurred",
  "Date/time of deviation occurrence and date/time of detection",
  "Mention the name of personnel who is involved in the deviation",
  "Mention initial scope of deviation (impacted product/Material/Equipment/System/Batches/etc.)",
];

export function DefineEditor() {
  const { updateSection } = useReport();
  const { status, lastSavedAt, value, flushSave } = useSectionSave("define");

  return (
    <SectionShell
      title="Define"
      description="Describe what happened and the initial scope of the deviation."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <TiptapSectionField
        section="define"
        contentPath="narrative"
        label="Details of Investigation (Narrative)"
        placeholder="On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation at [location], it was observed that… Include: location of deviation, date/time of occurrence & detection, personnel involved, and initial scope."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) => updateSection("define", (p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
