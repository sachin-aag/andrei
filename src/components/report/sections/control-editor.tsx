"use client";

import { createId } from "@paralleldrive/cuid2";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";

const CHECKS = [
  "Were specific preventive actions identified for each root cause / substantiated probable root cause as applicable?",
  "Was the preventive action linked to the classification of the root cause?",
  "Was the preventive action assigned a unique number, responsible person and due date?",
  "Does the action describe an expected outcome that can be verified?",
  "Was effectiveness verification required or not, and the rationale documented?",
  "Was an interim plan needed? If so, addressed?",
  "Was rationale provided when no preventive action was identified?",
  "Do the final comments support the conclusion of the investigation and CAPA?",
  "Was each of the impact assessment fields completed correctly?",
  "Does the recommended lot disposition match the conclusions?",
  "Does the conclusion include final decision and rationale?",
  "Is the CAPA verified complete prior to material/batch disposition?",
  "Does the conclusion include root cause summary and final scope/impact?",
  "Are the identified preventive actions achievable?",
];

export function ControlEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value } = useSectionSave("control");

  const addAction = () => {
    updateSection("control", (p) => ({
      ...p,
      preventiveActions: [
        ...p.preventiveActions,
        {
          id: createId(),
          description: "",
          responsiblePerson: "",
          dueDate: "",
          expectedOutcome: "",
          effectivenessVerification: "",
          linkedRootCause: "",
        },
      ],
    }));
  };

  return (
    <SectionShell
      title="Control"
      description="Define preventive actions, interim plan, impact assessment, and conclusion."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <div className="grid gap-1.5">
        <Label>Narrative</Label>
        <Textarea
          value={value.narrative}
          disabled={readOnly}
          className="min-h-[220px]"
          onChange={(e) =>
            updateSection("control", (p) => ({
              ...p,
              narrative: e.target.value,
            }))
          }
          placeholder="The investigation has been carried out through ... During the investigation root cause ..."
        />
      </div>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--foreground)]">
            Preventive Actions
          </h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={addAction}>
              <Plus className="size-3" /> Add Action
            </Button>
          )}
        </div>

        {value.preventiveActions.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground)] italic border border-dashed border-[var(--border)] rounded-md p-4 text-center">
            No preventive actions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {value.preventiveActions.map((a, idx) => (
              <div
                key={a.id}
                className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)]">
                    PA-{String(idx + 1).padStart(3, "0")}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() =>
                        updateSection("control", (p) => ({
                          ...p,
                          preventiveActions: p.preventiveActions.filter(
                            (_, i) => i !== idx
                          ),
                        }))
                      }
                      className="text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={a.description}
                    disabled={readOnly}
                    className="min-h-[70px]"
                    onChange={(e) =>
                      updateSection("control", (p) => ({
                        ...p,
                        preventiveActions: p.preventiveActions.map((x, i) =>
                          i === idx ? { ...x, description: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Linked root cause</Label>
                    <Input
                      value={a.linkedRootCause}
                      disabled={readOnly}
                      placeholder="e.g. Equipment / Instrument"
                      onChange={(e) =>
                        updateSection("control", (p) => ({
                          ...p,
                          preventiveActions: p.preventiveActions.map((x, i) =>
                            i === idx ? { ...x, linkedRootCause: e.target.value } : x
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Responsible person</Label>
                    <Input
                      value={a.responsiblePerson}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateSection("control", (p) => ({
                          ...p,
                          preventiveActions: p.preventiveActions.map((x, i) =>
                            i === idx
                              ? { ...x, responsiblePerson: e.target.value }
                              : x
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={a.dueDate}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateSection("control", (p) => ({
                          ...p,
                          preventiveActions: p.preventiveActions.map((x, i) =>
                            i === idx ? { ...x, dueDate: e.target.value } : x
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Expected outcome</Label>
                    <Input
                      value={a.expectedOutcome}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateSection("control", (p) => ({
                          ...p,
                          preventiveActions: p.preventiveActions.map((x, i) =>
                            i === idx ? { ...x, expectedOutcome: e.target.value } : x
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Effectiveness verification</Label>
                  <Textarea
                    value={a.effectivenessVerification}
                    disabled={readOnly}
                    className="min-h-[60px]"
                    onChange={(e) =>
                      updateSection("control", (p) => ({
                        ...p,
                        preventiveActions: p.preventiveActions.map((x, i) =>
                          i === idx
                            ? { ...x, effectivenessVerification: e.target.value }
                            : x
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>Interim plan</Label>
          <Textarea
            value={value.interimPlan}
            disabled={readOnly}
            className="min-h-[80px]"
            onChange={(e) =>
              updateSection("control", (p) => ({
                ...p,
                interimPlan: e.target.value,
              }))
            }
            placeholder="If preventive actions take time, describe interim plan or rationale if not required."
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Final comments</Label>
          <Textarea
            value={value.finalComments}
            disabled={readOnly}
            className="min-h-[80px]"
            onChange={(e) =>
              updateSection("control", (p) => ({
                ...p,
                finalComments: e.target.value,
              }))
            }
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-[var(--foreground)]">
          Impact assessment (post-investigation)
        </h3>
        <div className="grid gap-3">
          {(
            [
              ["regulatoryImpact", "Regulatory impact / notification"],
              ["productQuality", "Product quality"],
              ["validation", "Validation"],
              ["stability", "Stability"],
              ["marketClinical", "Market / Clinical"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label>{label}</Label>
              <Textarea
                value={value[key]}
                disabled={readOnly}
                className="min-h-[60px]"
                onChange={(e) =>
                  updateSection("control", (p) => ({
                    ...p,
                    [key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label>Lot disposition</Label>
            <Textarea
              value={value.lotDisposition}
              disabled={readOnly}
              className="min-h-[70px]"
              onChange={(e) =>
                updateSection("control", (p) => ({
                  ...p,
                  lotDisposition: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Conclusion</Label>
            <Textarea
              value={value.conclusion}
              disabled={readOnly}
              className="min-h-[120px]"
              onChange={(e) =>
                updateSection("control", (p) => ({
                  ...p,
                  conclusion: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </section>
    </SectionShell>
  );
}
