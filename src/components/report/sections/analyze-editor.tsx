"use client";

import { Separator } from "@/components/ui/separator";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { PlainTextSuggestionField } from "@/components/report/plain-text-suggestion-field";
import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { normalizeFiveWhyNarrative } from "@/lib/analyze-five-why";

const SIX_M_FIELDS: Array<[keyof Omit<{
  man: string;
  machine: string;
  measurement: string;
  material: string;
  method: string;
  milieu: string;
  conclusion: string;
}, "conclusion">, string]> = [
  ["man", "Man"],
  ["machine", "Machine"],
  ["measurement", "Measurement"],
  ["material", "Material"],
  ["method", "Method"],
  ["milieu", "Milieu (Environment)"],
];

export function AnalyzeEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("analyze");
  const { status, lastSavedAt, value, flushSave } = useSectionSave("analyze");

  return (
    <SectionShell
      title="Analyze"
      description="Investigate the root cause using 6M, 5-Why, and assess impact."
      status={status}
      lastSavedAt={lastSavedAt}
      section="analyze"
    >
      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          6M Method (If Applicable)
        </h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          No 6M question shall be deleted in the investigation. If any is not
          applicable, mention &quot;Not Applicable&quot; in the answer.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {SIX_M_FIELDS.map(([key, label]) => (
            <PlainTextSuggestionField
              key={key}
              section="analyze"
              contentPath={`sixM.${key}`}
              label={label}
              value={value.sixM[key]}
              disabled={readOnly}
              placeholder="Not Applicable"
              className="min-h-[70px]"
              onChange={(next) =>
                update((p) => ({
                  ...p,
                  sixM: { ...p.sixM, [key]: next },
                }))
              }
            />
          ))}
        </div>
        <PlainTextSuggestionField
          section="analyze"
          contentPath="sixM.conclusion"
          label="6M Conclusion"
          value={value.sixM.conclusion}
          disabled={readOnly}
          className="min-h-[70px]"
          onChange={(next) =>
            update((p) => ({
              ...p,
              sixM: { ...p.sixM, conclusion: next },
            }))
          }
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">5-Why Approach</h3>
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
          <TiptapSectionField
            section="analyze"
            contentPath="fiveWhy.narrative"
            label="5-Why analysis"
            placeholder="Capture each Why and answer, then your conclusion — all in this box (same as the investigation template)."
            className="grid gap-1.5 scroll-mt-24"
            value={normalizeFiveWhyNarrative(value.fiveWhy.narrative)}
            onChange={(doc) =>
              update((p) => ({
                ...p,
                fiveWhy: {
                  ...p.fiveWhy,
                  narrative: doc,
                  conclusion: "",
                },
              }))
            }
            onFlushSave={flushSave}
          />
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <PlainTextSuggestionField
          section="analyze"
          contentPath="brainstorming"
          label="Brainstorming"
          value={value.brainstorming}
          disabled={readOnly}
          placeholder="Not Applicable"
          className="min-h-[80px]"
          onChange={(next) =>
            update((p) => ({
              ...p,
              brainstorming: next,
            }))
          }
        />
        <PlainTextSuggestionField
          section="analyze"
          contentPath="otherTools"
          label="Other Tools (If any)"
          value={value.otherTools}
          disabled={readOnly}
          placeholder="Not Applicable"
          className="min-h-[60px]"
          onChange={(next) =>
            update((p) => ({
              ...p,
              otherTools: next,
            }))
          }
        />
        <TiptapSectionField
          section="analyze"
          contentPath="investigationOutcome"
          label="Investigation Outcome"
          placeholder="Summarize the investigation driven by the selected tool(s) and describe the outcome."
          className="grid gap-1.5 scroll-mt-24"
          value={value.investigationOutcome}
          onChange={(doc) =>
            update((p) => ({
              ...p,
              investigationOutcome: doc,
            }))
          }
          onFlushSave={flushSave}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Identified Root Cause / Probable Cause
        </h3>
        <TiptapSectionField
          section="analyze"
          contentPath="rootCause.narrative"
          label="Root cause narrative"
          className="grid gap-1.5 scroll-mt-24"
          value={value.rootCause.narrative}
          onChange={(doc) =>
            update((p) => ({
              ...p,
              rootCause: { ...p.rootCause, narrative: doc },
            }))
          }
          onFlushSave={flushSave}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Impact Assessment (System / Document / Product / Equipment / Patient safety / Past
          batches)
        </h3>
        <TiptapSectionField
          section="analyze"
          contentPath="impactAssessment"
          label="Impact assessment"
          placeholder="System, Document, Product, Equipment, Patient safety / Past batches — describe impact for each area as applicable."
          className="grid gap-1.5 scroll-mt-24 min-h-[200px]"
          value={value.impactAssessment}
          onChange={(doc) =>
            update((p) => ({
              ...p,
              impactAssessment: doc,
            }))
          }
          onFlushSave={flushSave}
          locked={readOnly}
        />
      </section>
    </SectionShell>
  );
}
