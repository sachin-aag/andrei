"use client";

import { type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import {
  useReportData,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { cn } from "@/lib/utils";

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

  const fieldAnchorProps = (path: string) => ({
    "data-field-anchor": `analyze.${path}`,
    className: "grid gap-1.5 scroll-mt-24",
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const suggestedControlClass = (_path: string) => "";

  const renderControl = (_path: string, control: ReactNode) => {
    return control;
  };

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
            <div key={key} {...fieldAnchorProps(`sixM.${key}`)}>
              <Label>{label}</Label>
              {renderControl(
                `sixM.${key}`,
                <Textarea
                  value={value.sixM[key]}
                  disabled={readOnly}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      sixM: { ...p.sixM, [key]: e.target.value },
                    }))
                  }
                  placeholder="Not Applicable"
                  className={cn("min-h-[70px]", suggestedControlClass(`sixM.${key}`))}
                />
              )}
            </div>
          ))}
        </div>
        <div {...fieldAnchorProps("sixM.conclusion")}>
          <Label>6M Conclusion</Label>
          {renderControl(
            "sixM.conclusion",
            <Textarea
              value={value.sixM.conclusion}
              disabled={readOnly}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  sixM: { ...p.sixM, conclusion: e.target.value },
                }))
              }
              className={cn("min-h-[70px]", suggestedControlClass("sixM.conclusion"))}
            />
          )}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">5-Why Approach</h3>
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
          <div {...fieldAnchorProps("fiveWhy.narrative")}>
            <Label>5-Why analysis</Label>
            {renderControl(
              "fiveWhy.narrative",
              <Textarea
                placeholder="Capture each Why and answer, then your conclusion — all in this box (same as the investigation template)."
                value={value.fiveWhy.narrative}
                disabled={readOnly}
                className={cn(
                  "min-h-[260px]",
                  suggestedControlClass("fiveWhy.narrative")
                )}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    fiveWhy: {
                      ...p.fiveWhy,
                      narrative: e.target.value,
                      conclusion: "",
                    },
                  }))
                }
              />
            )}
          </div>
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>Brainstorming</Label>
          <Textarea
            value={value.brainstorming}
            disabled={readOnly}
            onChange={(e) =>
              update((p) => ({
                ...p,
                brainstorming: e.target.value,
              }))
            }
            placeholder="Not Applicable"
            className="min-h-[80px]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Other Tools (If any)</Label>
          <Textarea
            value={value.otherTools}
            disabled={readOnly}
            onChange={(e) =>
              update((p) => ({
                ...p,
                otherTools: e.target.value,
              }))
            }
            placeholder="Not Applicable"
            className="min-h-[60px]"
          />
        </div>
        <div {...fieldAnchorProps("investigationOutcome")}>
          <TiptapSectionField
            section="analyze"
            contentPath="investigationOutcome"
            label="Investigation Outcome"
            placeholder="Summarize the investigation driven by the selected tool(s) and describe the outcome."
            className={cn("grid gap-1.5", suggestedControlClass("investigationOutcome"))}
            value={value.investigationOutcome}
            onChange={(doc) =>
              update((p) => ({
                ...p,
                investigationOutcome: doc,
              }))
            }
            onFlushSave={flushSave}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Identified Root Cause / Probable Cause
        </h3>
        <div {...fieldAnchorProps("rootCause.narrative")}>
          <TiptapSectionField
            section="analyze"
            contentPath="rootCause.narrative"
            label="Root cause narrative"
            className={cn("grid gap-1.5", suggestedControlClass("rootCause.narrative"))}
            value={value.rootCause.narrative}
            onChange={(doc) =>
              update((p) => ({
                ...p,
                rootCause: { ...p.rootCause, narrative: doc },
              }))
            }
            onFlushSave={flushSave}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Impact Assessment (System / Document / Product / Equipment / Patient safety / Past
          batches)
        </h3>
        <div {...fieldAnchorProps("impactAssessment")}>
          {renderControl(
            "impactAssessment",
            <Textarea
              value={value.impactAssessment}
              disabled={readOnly}
              className={cn("min-h-[200px]", suggestedControlClass("impactAssessment"))}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  impactAssessment: e.target.value,
                }))
              }
            />
          )}
        </div>
      </section>
    </SectionShell>
  );
}
