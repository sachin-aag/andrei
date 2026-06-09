"use client";

import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { SectionShell } from "./section-shell";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export function ImproveEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("improve");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("improve");

  return (
    <SectionShell
      title="Improve"
      description="Describe corrective actions, ownership, timelines, verification, and any related detail."
      status={status}
      lastSavedAt={lastSavedAt}
      section="improve"
    >
      <TiptapSectionField
        section="improve"
        contentPath="correctiveActions"
        label="Corrective Action"
        placeholder="Describe corrective actions taken or proposed, including tracking numbers, responsible persons, due dates, expected outcomes, and effectiveness verification where applicable."
        className="grid gap-1.5 scroll-mt-24 min-h-[220px]"
        value={value.correctiveActions}
        onChange={(doc) =>
          update((p) => ({
            ...p,
            narrative: emptyDoc(),
            correctiveActions: doc,
          }))
        }
        onFlushSave={flushSave}
        locked={readOnly}
      />
    </SectionShell>
  );
}
