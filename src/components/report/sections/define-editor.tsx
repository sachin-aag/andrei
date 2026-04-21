"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";

const CHECKS = [
  "Clearly define what happens actually",
  "Explain what is different than expected",
  "Mention the location where the deviation has occurred",
  "Date/time of deviation occurrence and date/time of detection",
  "Mention the name of personnel who is involved in the deviation",
  "Mention initial scope of deviation (impacted product/Material/Equipment/System/Batches/etc.)",
];

export function DefineEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value } = useSectionSave("define");

  return (
    <SectionShell
      title="Define"
      description="Describe what happened and the initial scope of the deviation."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <div className="grid gap-2">
        <Label>Details of Investigation (Narrative)</Label>
        <Textarea
          value={value.narrative}
          disabled={readOnly}
          onChange={(e) =>
            updateSection("define", (p) => ({ ...p, narrative: e.target.value }))
          }
          placeholder={`On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation at [location], it was observed that...\n\nInclude: location of deviation, date/time of occurrence & detection, personnel involved, and initial scope (impacted product/material/equipment/system/batches).`}
          className="min-h-[360px]"
        />
      </div>
    </SectionShell>
  );
}
