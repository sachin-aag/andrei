"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";

const CHECKS = [
  "Does the summary provide relevant facts and data/information reviewed (environment, process/product history, personnel info, control limits)?",
  "Is a summary of the analysis of the factors and data provided?",
  "Is a conclusion statement of the analysis and review provided?",
  "If there were regulatory notifications, were details provided?",
  "Is the report written in a logical flow and easily understood by the reader?",
];

export function MeasureEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value } = useSectionSave("measure");

  return (
    <SectionShell
      title="Measure"
      description="Summarize the facts, data reviewed, and conclusion of analysis."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <div className="grid gap-2">
        <Label>Measurement Narrative</Label>
        <Textarea
          value={value.narrative}
          disabled={readOnly}
          onChange={(e) =>
            updateSection("measure", (p) => ({
              ...p,
              narrative: e.target.value,
            }))
          }
          placeholder={`The equipment is installed in ... SOP No. ... is in place for ...\n\nInclude regulatory notification details if applicable.`}
          className="min-h-[400px]"
        />
      </div>
    </SectionShell>
  );
}
