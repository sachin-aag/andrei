"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function ControlEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value, flushSave } = useSectionSave("control");

  return (
    <SectionShell
      title="Control"
      description="Define preventive actions, interim plan, impact assessment, and conclusion."
      status={status}
      lastSavedAt={lastSavedAt}
      section="control"
    >
      <TiptapSectionField
        section="control"
        contentPath="narrative"
        label="Narrative"
        placeholder="The investigation has been carried out through … During the investigation root cause …"
        className="grid gap-1.5"
        value={value.narrative}
        onChange={(doc) =>
          updateSection("control", (p) => ({ ...p, narrative: doc }))
        }
        onFlushSave={flushSave}
      />

      <Separator />

      <div className="grid gap-1.5">
        <Label>Preventive actions</Label>
        <Textarea
          value={value.preventiveActions}
          disabled={readOnly}
          className="min-h-[160px]"
          placeholder="List preventive actions for each root cause. Include unique number, responsible person, due date, expected outcome, linked root cause, and effectiveness verification (or rationale if not required)."
          onChange={(e) =>
            updateSection("control", (p) => ({
              ...p,
              preventiveActions: e.target.value,
            }))
          }
        />
      </div>

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
