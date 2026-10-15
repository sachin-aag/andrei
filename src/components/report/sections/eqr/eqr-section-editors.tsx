"use client";

import type { ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  EMPTY_EQR_CONTENT,
  EQR_FIELDS,
  EQR_SECTION_KEYS,
  EQR_SECTION_LABELS,
  type EqrSectionContent,
  type EqrSectionKey,
} from "@/lib/document-types/eqr/sections";

/** One section: a separate box per prose field and per fixed-schema table. */
function EqrSectionEditor({ section }: { section: EqrSectionKey }) {
  const { update } = useGenericReportSection<EqrSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(section);
  const content = (value as EqrSectionContent | undefined) ?? EMPTY_EQR_CONTENT[section];
  const fields = EQR_FIELDS[section];

  return (
    <SectionShell title={EQR_SECTION_LABELS[section]} status={status} lastSavedAt={lastSavedAt} section={section}>
      <div className="grid gap-4">
        {fields.map((field) => (
          <TiptapSectionField
            key={field.key}
            section={section}
            contentPath={field.key}
            label={fields.length > 1 || field.kind === "table" ? field.label : "Content"}
            placeholder={field.kind === "table" ? "Use the table toolbar to add rows." : "Write this section…"}
            className="grid gap-2"
            value={(content[field.key] ?? EMPTY_EQR_CONTENT[section][field.key]) as JSONContent}
            onChange={(next) => update((prev) => ({ ...(prev ?? {}), [field.key]: next }))}
            onFlushSave={flushSave}
          />
        ))}
      </div>
    </SectionShell>
  );
}

function makeEditor(section: EqrSectionKey): ComponentType {
  function Editor() {
    return <EqrSectionEditor section={section} />;
  }
  Editor.displayName = `EqrEditor_${section}`;
  return Editor;
}

export const EQR_SECTION_EDITORS: Record<EqrSectionKey, ComponentType> = Object.fromEntries(
  EQR_SECTION_KEYS.map((key) => [key, makeEditor(key)])
) as Record<EqrSectionKey, ComponentType>;
