"use client";

import { useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function ConclusionEditor() {
  const { update } = useReportSection("conclusion");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("conclusion");

  return (
    <SectionShell
      title="Conclusion"
      description="Summarize the investigation outcome, disposition, and final decisions."
      status={status}
      lastSavedAt={lastSavedAt}
      section="conclusion"
    >
      <TiptapSectionField
        section="conclusion"
        contentPath="narrative"
        label="Investigation conclusion"
        placeholder="Provide a brief summary of root cause, final scope and impact, disposition decisions, and any remaining actions."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
