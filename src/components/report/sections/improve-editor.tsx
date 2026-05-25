"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export function ImproveEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("improve");
  const { status, lastSavedAt, value } = useSectionSave("improve");

  return (
    <SectionShell
      title="Improve"
      description="Describe corrective actions, ownership, timelines, verification, and any related detail."
      status={status}
      lastSavedAt={lastSavedAt}
      section="improve"
    >
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
              narrative: emptyDoc(),
              correctiveActions: e.target.value,
            }))
          }
        />
      </div>
    </SectionShell>
  );
}
