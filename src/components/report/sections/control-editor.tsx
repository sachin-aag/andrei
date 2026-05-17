"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { CriteriaChecklist, SectionShell } from "./section-shell";
import { SECTION_GUIDANCE } from "@/lib/report-section-guidance";

export function ControlEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("control");
  const { status, lastSavedAt, value } = useSectionSave("control");

  return (
    <SectionShell
      title="Control"
      description="Describe preventive actions, rationale when none are needed, tracking, expected outcomes, and verification—together in one place."
      status={status}
      lastSavedAt={lastSavedAt}
      section="control"
    >
      <CriteriaChecklist items={SECTION_GUIDANCE.control ?? []} ordered />

      <div className="grid gap-1.5">
        <Label>Preventive actions</Label>
        <Textarea
          value={value.preventiveActions}
          disabled={readOnly}
          className="min-h-[280px]"
          placeholder="Describe preventive actions (per root cause where applicable), tracking IDs, responsible persons, due dates, expected outcomes, effectiveness verification or rationale, and any interim or closure context—in one continuous section."
          onChange={(e) =>
            update(() => ({
              preventiveActions: e.target.value,
            }))
          }
        />
      </div>
    </SectionShell>
  );
}
