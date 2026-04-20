"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";
import { SectionShell, CriteriaChecklist } from "./section-shell";

const CHECKS = [
  "Clearly define what happens actually",
  "Explain what is different than expected",
  "Mention the location where the deviation has occurred",
  "Date/time of deviation occurrence and date/time of detection",
  "Mention the name of personnel who is involved in the deviation",
  "Mention initial scope of deviation (impacted product/Material/Equipment/System/Batches/etc.)",
];

export function DefineEditor() {
  const { updateSection, readOnly } = useReport();
  const { status, lastSavedAt, value } = useSectionSave("define");

  return (
    <SectionShell
      title="Define"
      description="Describe what happened and the initial scope of the deviation."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <CriteriaChecklist items={CHECKS} />

      <div className="grid gap-2">
        <Label>Details of Investigation (Narrative)</Label>
        <Textarea
          value={value.narrative}
          disabled={readOnly}
          onChange={(e) =>
            updateSection("define", (p) => ({ ...p, narrative: e.target.value }))
          }
          placeholder={`On dated DD/MM/YYYY at approximately HH:MM hrs, while ...`}
          className="min-h-[260px]"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Location of deviation</Label>
          <Input
            value={value.location ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("define", (p) => ({
                ...p,
                location: e.target.value,
              }))
            }
            placeholder="e.g. GF-122 Packing area, Intermediate Walk-in Cold Room (E/PK/010)"
          />
        </div>
        <div className="grid gap-2">
          <Label>Personnel involved</Label>
          <Input
            value={value.personnel ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("define", (p) => ({
                ...p,
                personnel: e.target.value,
              }))
            }
            placeholder="e.g. Packing colleague (Employee ID: 598)"
          />
        </div>
        <div className="grid gap-2">
          <Label>Date/time of occurrence</Label>
          <Input
            value={value.dateTimeOccurrence ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("define", (p) => ({
                ...p,
                dateTimeOccurrence: e.target.value,
              }))
            }
            placeholder="06/02/2026 03:47"
          />
        </div>
        <div className="grid gap-2">
          <Label>Date/time of detection</Label>
          <Input
            value={value.dateTimeDetection ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("define", (p) => ({
                ...p,
                dateTimeDetection: e.target.value,
              }))
            }
            placeholder="04/03/2026 16:20"
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>Initial scope of deviation</Label>
          <Textarea
            value={value.initialScope ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateSection("define", (p) => ({
                ...p,
                initialScope: e.target.value,
              }))
            }
            placeholder="Impacted product/material/equipment/system/batches"
            className="min-h-[80px]"
          />
        </div>
      </div>
    </SectionShell>
  );
}
