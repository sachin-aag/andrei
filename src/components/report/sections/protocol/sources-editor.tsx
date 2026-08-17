"use client";

import { SectionShell } from "@/components/report/sections/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGenericReportSection, useReportData } from "@/providers/report-provider";
import type { SourcesContent } from "@/lib/design-inputs/types";
import { EMPTY_PROTOCOL_SOURCES } from "@/lib/document-types/verification-protocol/sections";
import { useProtocolSectionSave } from "./use-protocol-section-save";

const FIELDS: Array<{ key: keyof SourcesContent; label: string }> = [
  { key: "protocolNo", label: "Protocol number" },
  { key: "protocolRev", label: "Protocol revision" },
  { key: "srsNo", label: "SRS number" },
  { key: "srsRev", label: "SRS revision" },
  { key: "planNo", label: "Plan number" },
  { key: "planRev", label: "Plan revision" },
];

export function ProtocolSourcesEditor() {
  const { readOnly } = useReportData();
  const { status, lastSavedAt } = useProtocolSectionSave<SourcesContent>("sources");
  const { value, update } = useGenericReportSection<SourcesContent>("sources");
  const sources = { ...EMPTY_PROTOCOL_SOURCES, ...value };

  return (
    <SectionShell
      title="Sources"
      description="Identify the protocol, software-requirements specification, and verification test plan by document number and revision."
      status={status}
      lastSavedAt={lastSavedAt}
      section="sources"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="grid gap-1.5">
            <Label htmlFor={`protocol-${field.key}`}>{field.label}</Label>
            <Input
              id={`protocol-${field.key}`}
              value={sources[field.key]}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                update((prev) => ({
                  ...EMPTY_PROTOCOL_SOURCES,
                  ...prev,
                  [field.key]: next,
                }));
              }}
            />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
