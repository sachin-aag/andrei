"use client";

import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { PlainTextSuggestionField } from "@/components/report/plain-text-suggestion-field";
import { CriteriaChecklist, SectionShell } from "./section-shell";
import { SECTION_GUIDANCE } from "@/lib/report-section-guidance";
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
      <CriteriaChecklist items={SECTION_GUIDANCE.improve ?? []} ordered />

      <PlainTextSuggestionField
        section="improve"
        contentPath="correctiveActions"
        label="Corrective Action"
        value={value.correctiveActions}
        disabled={readOnly}
        className="min-h-[220px]"
        placeholder="Describe corrective actions taken or proposed, including tracking numbers, responsible persons, due dates, expected outcomes, and effectiveness verification where applicable."
        onChange={(next) =>
          update((p) => ({
            ...p,
            narrative: emptyDoc(),
            correctiveActions: next,
          }))
        }
      />
    </SectionShell>
  );
}
