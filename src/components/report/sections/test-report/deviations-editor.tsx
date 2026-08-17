"use client";

import { SectionShell } from "@/components/report/sections/section-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  asTestReportDeviations,
  type TestReportDeviationItem,
  type TestReportDeviationsSection,
} from "@/lib/document-types/verification-test-report/sections";

function emptyItem(): TestReportDeviationItem {
  return {
    id: crypto.randomUUID(),
    number: "",
    reqIds: "",
    observation: "",
    rationale: "",
    resolution: "",
    jira: "",
  };
}

export function TestReportDeviationsEditor() {
  const { update } = useGenericReportSection<TestReportDeviationsSection>(
    "deviations"
  );
  const { status, lastSavedAt, value } = useGenericSectionSave("deviations");
  const content = asTestReportDeviations(value);

  function patchItem(id: string, patch: Partial<TestReportDeviationItem>) {
    update((prev) => {
      const items = asTestReportDeviations(prev).items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );
      return { items };
    });
  }

  return (
    <SectionShell
      title="Deviations"
      description="One card per deviation. Observation, rationale, and resolution are required for the check."
      status={status}
      lastSavedAt={lastSavedAt}
      section="deviations"
    >
      <div className="grid gap-4">
        {content.items.map((item, index) => (
          <div
            key={item.id || index}
            className="grid gap-3 rounded-md border border-[var(--border)] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <LabeledInput
                itemId={item.id}
                label="Number"
                value={item.number}
                onChange={(number) => patchItem(item.id, { number })}
              />
              <LabeledInput
                itemId={item.id}
                label="Requirement IDs"
                value={item.reqIds}
                onChange={(reqIds) => patchItem(item.id, { reqIds })}
              />
              <LabeledInput
                itemId={item.id}
                label="Jira"
                value={item.jira}
                onChange={(jira) => patchItem(item.id, { jira })}
              />
            </div>
            <LabeledArea
              itemId={item.id}
              label="Observation"
              value={item.observation}
              onChange={(observation) => patchItem(item.id, { observation })}
            />
            <LabeledArea
              itemId={item.id}
              label="Rationale"
              value={item.rationale}
              onChange={(rationale) => patchItem(item.id, { rationale })}
            />
            <LabeledArea
              itemId={item.id}
              label="Resolution"
              value={item.resolution}
              onChange={(resolution) => patchItem(item.id, { resolution })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                update((prev) => ({
                  items: asTestReportDeviations(prev).items.filter(
                    (row) => row.id !== item.id
                  ),
                }))
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            update((prev) => ({
              items: [...asTestReportDeviations(prev).items, emptyItem()],
            }))
          }
        >
          Add deviation
        </Button>
      </div>
    </SectionShell>
  );
}

function LabeledInput({
  itemId,
  label,
  value,
  onChange,
}: {
  itemId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `${itemId}-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function LabeledArea({
  itemId,
  label,
  value,
  onChange,
}: {
  itemId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `${itemId}-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    </div>
  );
}
