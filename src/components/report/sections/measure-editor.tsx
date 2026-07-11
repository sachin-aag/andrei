"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyDoc, normalizeRichField } from "@/lib/tiptap/rich-text";
import { useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function MeasureEditor() {
  const { update } = useReportSection("measure");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("measure");

  return (
    <SectionShell
      title="Measure"
      description="Summarize the facts, data reviewed, and conclusion of analysis."
      status={status}
      lastSavedAt={lastSavedAt}
      section="measure"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="experiment-number">Experiment number</Label>
          <Input
            id="experiment-number"
            value={value.experimentNumber ?? ""}
            onChange={(e) =>
              update((p) => ({ ...p, experimentNumber: e.target.value }))
            }
            onBlur={flushSave}
            placeholder="e.g. EXP-2026-014"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="experiment-title">Experiment title</Label>
          <Input
            id="experiment-title"
            value={value.experimentTitle ?? ""}
            onChange={(e) =>
              update((p) => ({ ...p, experimentTitle: e.target.value }))
            }
            onBlur={flushSave}
            placeholder="Short title of the supporting experiment"
          />
        </div>
      </div>
      <TiptapSectionField
        section="measure"
        contentPath="purpose"
        label="Experiment purpose"
        placeholder="Describe why the experiment was performed and what question it answers."
        className="grid gap-2"
        value={normalizeRichField(value.purpose)}
        onChange={(doc) => update((p) => ({ ...p, purpose: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section="measure"
        contentPath="conclusion"
        label="Experiment conclusion"
        placeholder="Summarize the outcome of the experiment and how it supports the investigation."
        className="grid gap-2"
        value={normalizeRichField(value.conclusion)}
        onChange={(doc) => update((p) => ({ ...p, conclusion: doc }))}
        onFlushSave={flushSave}
      />
      <TiptapSectionField
        section="measure"
        contentPath="narrative"
        label="Measurement narrative"
        placeholder="Summarize the facts, data reviewed, and analysis supporting the measure phase."
        className="grid gap-2"
        value={value.narrative}
        onChange={(doc) => update((p) => ({ ...p, narrative: doc }))}
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}
