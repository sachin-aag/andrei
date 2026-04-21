"use client";

import { Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";

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
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value } = useSectionSave("analyze");

  return (
    <SectionShell
      title="Analyze"
      description="Investigate the root cause using 6M, 5-Why, and assess impact."
      status={status}
      lastSavedAt={lastSavedAt}
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
            <div key={key} className="grid gap-1.5">
              <Label>{label}</Label>
              <Textarea
                value={value.sixM[key]}
                disabled={readOnly}
                onChange={(e) =>
                  updateSection("analyze", (p) => ({
                    ...p,
                    sixM: { ...p.sixM, [key]: e.target.value },
                  }))
                }
                placeholder="Not Applicable"
                className="min-h-[70px]"
              />
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label>6M Conclusion</Label>
          <Textarea
            value={value.sixM.conclusion}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("analyze", (p) => ({
                ...p,
                sixM: { ...p.sixM, conclusion: e.target.value },
              }))
            }
            className="min-h-[70px]"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">5-Why Approach</h3>
        <div className="space-y-3">
          {value.fiveWhy.whys.map((why, idx) => (
            <div
              key={idx}
              className="grid gap-2 p-3 rounded-md border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  Why {idx + 1}
                </span>
                {!readOnly && value.fiveWhy.whys.length > 1 && (
                  <button
                    onClick={() =>
                      updateSection("analyze", (p) => ({
                        ...p,
                        fiveWhy: {
                          ...p.fiveWhy,
                          whys: p.fiveWhy.whys.filter((_, i) => i !== idx),
                        },
                      }))
                    }
                    className="text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <Input
                placeholder="Why question?"
                value={why.question}
                disabled={readOnly}
                onChange={(e) =>
                  updateSection("analyze", (p) => ({
                    ...p,
                    fiveWhy: {
                      ...p.fiveWhy,
                      whys: p.fiveWhy.whys.map((w, i) =>
                        i === idx ? { ...w, question: e.target.value } : w
                      ),
                    },
                  }))
                }
              />
              <Textarea
                placeholder="Answer"
                value={why.answer}
                disabled={readOnly}
                className="min-h-[70px]"
                onChange={(e) =>
                  updateSection("analyze", (p) => ({
                    ...p,
                    fiveWhy: {
                      ...p.fiveWhy,
                      whys: p.fiveWhy.whys.map((w, i) =>
                        i === idx ? { ...w, answer: e.target.value } : w
                      ),
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label>5-Why Conclusion</Label>
          <Textarea
            value={value.fiveWhy.conclusion}
            disabled={readOnly}
            className="min-h-[100px]"
            onChange={(e) =>
              updateSection("analyze", (p) => ({
                ...p,
                fiveWhy: { ...p.fiveWhy, conclusion: e.target.value },
              }))
            }
          />
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
              updateSection("analyze", (p) => ({
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
              updateSection("analyze", (p) => ({
                ...p,
                otherTools: e.target.value,
              }))
            }
            placeholder="Not Applicable"
            className="min-h-[60px]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Investigation Outcome</Label>
          <Textarea
            value={value.investigationOutcome}
            disabled={readOnly}
            className="min-h-[200px]"
            onChange={(e) =>
              updateSection("analyze", (p) => ({
                ...p,
                investigationOutcome: e.target.value,
              }))
            }
            placeholder="Summarize the investigation driven by the selected tool(s) and describe the outcome."
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Identified Root Cause / Probable Cause
        </h3>
        <div className="grid gap-1.5">
          <Label>Root cause narrative</Label>
          <Textarea
            value={value.rootCause.narrative}
            disabled={readOnly}
            className="min-h-[80px]"
            onChange={(e) =>
              updateSection("analyze", (p) => ({
                ...p,
                rootCause: { ...p.rootCause, narrative: e.target.value },
              }))
            }
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Primary (Level 1)</Label>
            <Input
              value={value.rootCause.primaryLevel1}
              disabled={readOnly}
              onChange={(e) =>
                updateSection("analyze", (p) => ({
                  ...p,
                  rootCause: {
                    ...p.rootCause,
                    primaryLevel1: e.target.value,
                  },
                }))
              }
              placeholder="Equipment / Instrument"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Secondary (Level 2)</Label>
            <Input
              value={value.rootCause.secondaryLevel2}
              disabled={readOnly}
              onChange={(e) =>
                updateSection("analyze", (p) => ({
                  ...p,
                  rootCause: {
                    ...p.rootCause,
                    secondaryLevel2: e.target.value,
                  },
                }))
              }
              placeholder="Not Applicable"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Third (Level 3)</Label>
            <Input
              value={value.rootCause.thirdLevel3}
              disabled={readOnly}
              onChange={(e) =>
                updateSection("analyze", (p) => ({
                  ...p,
                  rootCause: {
                    ...p.rootCause,
                    thirdLevel3: e.target.value,
                  },
                }))
              }
              placeholder="Not Applicable"
            />
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
            <div key={key} className="grid gap-1.5">
              <Label>{label}</Label>
              <Textarea
                value={value.impactAssessment[key]}
                disabled={readOnly}
                className="min-h-[70px]"
                onChange={(e) =>
                  updateSection("analyze", (p) => ({
                    ...p,
                    impactAssessment: {
                      ...p.impactAssessment,
                      [key]: e.target.value,
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>
    </SectionShell>
  );
}
