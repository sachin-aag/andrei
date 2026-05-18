"use client";

import { type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  const { status, lastSavedAt, value } = useSectionSave("analyze");

  const fieldAnchorProps = (path: string, extraClassName?: string) => ({
    "data-field-anchor": `analyze.${path}`,
    className: cn("grid gap-1.5 scroll-mt-24", extraClassName),
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
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-4 space-y-4">
          <div {...fieldAnchorProps("fiveWhy.narrative")}>
            <Label>5-Why Narrative</Label>
            {renderControl(
              "fiveWhy.narrative",
              <Textarea
                placeholder="Capture the complete 5-Why analysis, including each Why and answer."
                value={value.fiveWhy.narrative}
                disabled={readOnly}
                className={cn(
                  "min-h-[220px]",
                  suggestedControlClass("fiveWhy.narrative")
                )}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    fiveWhy: { ...p.fiveWhy, narrative: e.target.value },
                  }))
                }
              />
            )}
          </div>
          <div
            {...fieldAnchorProps(
              "fiveWhy.conclusion",
              "pt-4 border-t border-[var(--border)]"
            )}
          >
            <Label>Conclusion</Label>
            {renderControl(
              "fiveWhy.conclusion",
              <Textarea
                placeholder="Summarize the root cause reached by this 5-Why chain."
                value={value.fiveWhy.conclusion}
                disabled={readOnly}
                className={cn(
                  "min-h-[100px]",
                  suggestedControlClass("fiveWhy.conclusion")
                )}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    fiveWhy: { ...p.fiveWhy, conclusion: e.target.value },
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
          <Label>Investigation Outcome</Label>
          {renderControl(
            "investigationOutcome",
            <Textarea
              value={value.investigationOutcome}
              disabled={readOnly}
              className={cn("min-h-[200px]", suggestedControlClass("investigationOutcome"))}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  investigationOutcome: e.target.value,
                }))
              }
              placeholder="Summarize the investigation driven by the selected tool(s) and describe the outcome."
            />
          )}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Identified Root Cause / Probable Cause
        </h3>
        <div {...fieldAnchorProps("rootCause.narrative")}>
          <Label>Root cause narrative</Label>
          {renderControl(
            "rootCause.narrative",
            <Textarea
              value={value.rootCause.narrative}
              disabled={readOnly}
              className={cn("min-h-[80px]", suggestedControlClass("rootCause.narrative"))}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  rootCause: { ...p.rootCause, narrative: e.target.value },
                }))
              }
            />
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div {...fieldAnchorProps("rootCause.primaryLevel1")}>
            <Label>Primary (Level 1)</Label>
            {renderControl(
              "rootCause.primaryLevel1",
              <Input
                value={value.rootCause.primaryLevel1}
                disabled={readOnly}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    rootCause: {
                      ...p.rootCause,
                      primaryLevel1: e.target.value,
                    },
                  }))
                }
                placeholder="Equipment / Instrument"
                className={suggestedControlClass("rootCause.primaryLevel1")}
              />
            )}
          </div>
          <div {...fieldAnchorProps("rootCause.secondaryLevel2")}>
            <Label>Secondary (Level 2)</Label>
            {renderControl(
              "rootCause.secondaryLevel2",
              <Input
                value={value.rootCause.secondaryLevel2}
                disabled={readOnly}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    rootCause: {
                      ...p.rootCause,
                      secondaryLevel2: e.target.value,
                    },
                  }))
                }
                placeholder="Not Applicable"
                className={suggestedControlClass("rootCause.secondaryLevel2")}
              />
            )}
          </div>
          <div {...fieldAnchorProps("rootCause.thirdLevel3")}>
            <Label>Third (Level 3)</Label>
            {renderControl(
              "rootCause.thirdLevel3",
              <Input
                value={value.rootCause.thirdLevel3}
                disabled={readOnly}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    rootCause: {
                      ...p.rootCause,
                      thirdLevel3: e.target.value,
                    },
                  }))
                }
                placeholder="Not Applicable"
                className={suggestedControlClass("rootCause.thirdLevel3")}
              />
            )}
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">Impact Assessment</h3>
        <div className="grid gap-3">
          {(
            [
              ["system", "System"],
              ["document", "Document"],
              ["product", "Product"],
              ["equipment", "Equipment"],
              ["patientSafety", "Patient safety / Past batches"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} {...fieldAnchorProps(`impactAssessment.${key}`)}>
              <Label>{label}</Label>
              {renderControl(
                `impactAssessment.${key}`,
                <Textarea
                  value={value.impactAssessment[key]}
                  disabled={readOnly}
                  className={cn(
                    "min-h-[70px]",
                    suggestedControlClass(`impactAssessment.${key}`)
                  )}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      impactAssessment: {
                        ...p.impactAssessment,
                        [key]: e.target.value,
                      },
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </SectionShell>
  );
}
