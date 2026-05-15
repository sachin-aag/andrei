"use client";

import { useMemo, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useReportData,
  useReportComments,
  useReportEvaluations,
  useReportSection,
} from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { useApplySuggestion } from "@/hooks/use-apply-suggestion";
import { SectionShell } from "./section-shell";
import { coerceLegacyFix } from "@/lib/ai/suggested-fix";
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
  const {
    comments,
  } = useReportComments();
  const { evaluations } = useReportEvaluations();
  const { update } = useReportSection("analyze");
  const { status, lastSavedAt, value } = useSectionSave("analyze");
  const {
    applySuggestion,
    ignoreSuggestion,
    pendingId,
  } = useApplySuggestion();

  const { suggestedFieldValues } = useMemo(() => {
    const byEvaluationId = new Map(evaluations.map((item) => [item.id, item]));
    const values = new Map<
      string,
      {
        value: string;
        evaluation: (typeof evaluations)[number];
      }
    >();
    for (const comment of comments) {
      if (
        comment.section !== "analyze" ||
        comment.status !== "open" ||
        !(comment.kind ?? "").startsWith("ai_") ||
        !comment.evaluationId
      ) {
        continue;
      }
      const evaluation = byEvaluationId.get(comment.evaluationId);
      if (!evaluation) continue;
      const fix = coerceLegacyFix(evaluation.suggestedFix);
      if (fix.kind !== "fields") continue;
      for (const op of fix.ops) {
        if (op.op === "set") {
          values.set(op.path, { value: op.value, evaluation });
        }
      }
    }
    return {
      suggestedFieldValues: values,
    };
  }, [comments, evaluations]);

  const fieldAnchorProps = (path: string) => ({
    "data-field-anchor": `analyze.${path}`,
    className: "grid gap-1.5 scroll-mt-24",
  });

  const hasFieldSuggestion = (path: string) => suggestedFieldValues.has(path);

  const suggestedControlClass = (path: string) =>
    hasFieldSuggestion(path)
      ? "rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      : "";

  const currentFieldValue = (path: string): string => {
    const result = path
      .split(".")
      .reduce<unknown>((acc, segment) => {
        if (!acc || typeof acc !== "object") return undefined;
        return (acc as Record<string, unknown>)[segment];
      }, value);
    return typeof result === "string" ? result : "";
  };

  const renderFieldDiffPreview = (path: string) => {
    const suggestion = suggestedFieldValues.get(path);
    if (!suggestion) return null;
    const busy = pendingId === suggestion.evaluation.id;
    const disabled = busy || pendingId !== null || readOnly;
    const current = currentFieldValue(path).trim();
    return (
      <div className="p-3 text-sm leading-relaxed">
        {current ? (
          <>
            <span className="suggestion-delete suggestion-delete-ai whitespace-pre-wrap">
              {current}
            </span>{" "}
          </>
        ) : null}
        <span className="suggestion-insert suggestion-insert-fix suggestion-insert-ai whitespace-pre-wrap">
          {suggestion.value}
        </span>
        <span className="suggestion-action-widget" aria-label="Suggestion actions">
          <button
            type="button"
            className="suggestion-action-button suggestion-action-button-accept"
            disabled={disabled}
            onClick={() => void applySuggestion(suggestion.evaluation)}
            aria-label={busy ? "Applying suggestion" : "Accept suggestion"}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
          <span className="suggestion-action-divider" aria-hidden="true" />
          <button
            type="button"
            className="suggestion-action-button suggestion-action-button-ignore"
            disabled={disabled}
            onClick={() => void ignoreSuggestion(suggestion.evaluation)}
            aria-label="Ignore suggestion"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
    );
  };

  const renderControl = (path: string, control: ReactNode) => {
    if (!hasFieldSuggestion(path)) return control;
    return (
      <div className="min-h-[90px] resize-y overflow-auto rounded-md border border-[var(--border)] bg-[var(--input)] shadow-sm focus-within:ring-1 focus-within:ring-[var(--ring)]">
        {renderFieldDiffPreview(path)}
      </div>
    );
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
        <div {...fieldAnchorProps("fiveWhy.narrative")}>
          <Label>5-Why Narrative</Label>
          {renderControl(
            "fiveWhy.narrative",
            <Textarea
              placeholder="Capture the complete 5-Why analysis, including each Why and answer."
              value={value.fiveWhy.narrative}
              disabled={readOnly}
              className={cn("min-h-[220px]", suggestedControlClass("fiveWhy.narrative"))}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  fiveWhy: { ...p.fiveWhy, narrative: e.target.value },
                }))
              }
            />
          )}
        </div>
        <div {...fieldAnchorProps("fiveWhy.conclusion")}>
          <Label>5-Why Conclusion</Label>
          {renderControl(
            "fiveWhy.conclusion",
            <Textarea
              value={value.fiveWhy.conclusion}
              disabled={readOnly}
              className={cn("min-h-[100px]", suggestedControlClass("fiveWhy.conclusion"))}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  fiveWhy: { ...p.fiveWhy, conclusion: e.target.value },
                }))
              }
            />
          )}
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
