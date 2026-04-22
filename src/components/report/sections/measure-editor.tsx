"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

const CHECKS = [
  "Does the summary provide relevant facts and data/information reviewed (environment, process/product history, personnel info, control limits)?",
  "Is a summary of the analysis of the factors and data provided?",
  "Is a conclusion statement of the analysis and review provided?",
  "If there were regulatory notifications, were details provided?",
  "Is the report written in a logical flow and easily understood by the reader?",
];

export function MeasureEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value, flushSave } = useSectionSave("measure");

  return (
    <SectionShell
      title="Measure"
      description="Summarize the facts, data reviewed, and conclusion of analysis."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

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
