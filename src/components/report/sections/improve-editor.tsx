"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { CriteriaChecklist, SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { SECTION_GUIDANCE } from "@/lib/report-section-guidance";

export function ImproveEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("improve");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("improve");

  return (
    <SectionShell
      title="Improve"
      description="Define corrective actions with unique tracking fields."
      status={status}
      lastSavedAt={lastSavedAt}
      section="improve"
    >
      <CriteriaChecklist items={SECTION_GUIDANCE.improve ?? []} ordered />

      <TiptapSectionField
        section="improve"
        contentPath="narrative"
        label="Narrative"
        placeholder="The nonconformance is related to … After identification of the nonconformance below actions were taken …"
        className="grid gap-1.5"
        value={value.narrative}
        onChange={(doc) =>
          update((p) => ({ ...p, narrative: doc }))
        }
        onFlushSave={flushSave}
      />

      <div className="grid gap-1.5">
        <Label>Corrective Action</Label>
        <Textarea
          value={value.correctiveActions}
          disabled={readOnly}
          className="min-h-[220px]"
          placeholder="Describe corrective actions taken or proposed, including tracking numbers, responsible persons, due dates, expected outcomes, and effectiveness verification where applicable."
          onChange={(e) =>
            update((p) => ({
              ...p,
              correctiveActions: e.target.value,
            }))
          }
        />
      </div>
    </SectionShell>
  );
}
