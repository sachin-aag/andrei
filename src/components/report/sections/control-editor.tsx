"use client";

import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { SectionShell } from "./section-shell";

export function ControlEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("control");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("control");

  return (
    <SectionShell
      title="Control"
      description="Describe preventive actions, rationale when none are needed, tracking, expected outcomes, and verification—together in one place."
      status={status}
      lastSavedAt={lastSavedAt}
      section="control"
    >
      <TiptapSectionField
        section="control"
        contentPath="preventiveActions"
        label="Preventive actions"
        placeholder="Describe preventive actions (per root cause where applicable), tracking IDs, responsible persons, due dates, expected outcomes, effectiveness verification or rationale, and any interim or closure context—in one continuous section."
        className="grid gap-1.5 scroll-mt-24 min-h-[280px]"
        value={value.preventiveActions}
        onChange={(doc) =>
          update((p) => ({
            ...p,
            preventiveActions: doc,
          }))
        }
        onFlushSave={flushSave}
        locked={readOnly}
      />
    </SectionShell>
  );
}
