"use client";

import { createId } from "@paralleldrive/cuid2";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

const CHECKS = [
  "Were specific corrective actions identified (including applicable immediate actions) to remediate the current issue?",
  "Were specific corrective actions identified for each root cause / substantiated probable root cause, as applicable?",
  "Was the corrective action assigned a unique number, responsible person, and due date so it can be tracked?",
  "Does the action describe what will be the expected outcome that can be verified?",
  "Was effectiveness verification required or not, and the rationale for either documented?",
  "Are the identified corrective actions achievable based on the information provided?",
];

export function ImproveEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value, flushSave } = useSectionSave("improve");

  const addAction = () => {
    updateSection("improve", (p) => ({
      ...p,
      correctiveActions: [
        ...p.correctiveActions,
        {
          id: createId(),
          description: "",
          responsiblePerson: "",
          dueDate: "",
          expectedOutcome: "",
          effectivenessVerification: "",
        },
      ],
    }));
  };

  return (
    <SectionShell
      title="Improve"
      description="Define corrective actions with unique tracking fields."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <TiptapSectionField
        section="improve"
        contentPath="narrative"
        label="Narrative"
        placeholder="The nonconformance is related to … After identification of the nonconformance below actions were taken …"
        className="grid gap-1.5"
        value={value.narrative}
        onChange={(doc) =>
          updateSection("improve", (p) => ({ ...p, narrative: doc }))
        }
        onFlushSave={flushSave}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--foreground)]">Corrective Actions</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={addAction}>
              <Plus className="size-3" /> Add Action
            </Button>
          )}
        </div>

        {value.correctiveActions.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground)] italic border border-dashed border-[var(--border)] rounded-md p-4 text-center">
            No corrective actions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {value.correctiveActions.map((a, idx) => (
              <div
                key={a.id}
                className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)]">
                    CA-{String(idx + 1).padStart(3, "0")}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() =>
                        updateSection("improve", (p) => ({
                          ...p,
                          correctiveActions: p.correctiveActions.filter(
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
                      updateSection("improve", (p) => ({
                        ...p,
                        correctiveActions: p.correctiveActions.map((x, i) =>
                          i === idx ? { ...x, description: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Responsible person</Label>
                    <Input
                      value={a.responsiblePerson}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateSection("improve", (p) => ({
                          ...p,
                          correctiveActions: p.correctiveActions.map((x, i) =>
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
                        updateSection("improve", (p) => ({
                          ...p,
                          correctiveActions: p.correctiveActions.map((x, i) =>
                            i === idx ? { ...x, dueDate: e.target.value } : x
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Expected outcome</Label>
                  <Textarea
                    value={a.expectedOutcome}
                    disabled={readOnly}
                    className="min-h-[60px]"
                    onChange={(e) =>
                      updateSection("improve", (p) => ({
                        ...p,
                        correctiveActions: p.correctiveActions.map((x, i) =>
                          i === idx ? { ...x, expectedOutcome: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Effectiveness verification</Label>
                  <Textarea
                    value={a.effectivenessVerification}
                    disabled={readOnly}
                    className="min-h-[60px]"
                    onChange={(e) =>
                      updateSection("improve", (p) => ({
                        ...p,
                        correctiveActions: p.correctiveActions.map((x, i) =>
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
      </div>
    </SectionShell>
  );
}
