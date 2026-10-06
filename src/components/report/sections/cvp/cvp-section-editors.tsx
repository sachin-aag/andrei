"use client";

import type { ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  EMPTY_CVP_CONTENT,
  CVP_SECTION_KEYS,
  CVP_SECTION_LABELS,
  isCvpTableSectionKey,
  type CvpSectionContent,
  type CvpSectionKey,
} from "@/lib/document-types/cvp/sections";

function CvpSectionEditor({ section }: { section: CvpSectionKey }) {
  const { update } = useGenericReportSection<CvpSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(section);
  const content =
    (value as CvpSectionContent | undefined) ?? EMPTY_CVP_CONTENT[section];
  const field = isCvpTableSectionKey(section) ? "table" : "narrative";
  const doc = (content as Record<string, JSONContent | undefined>)[field];

  return (
    <SectionShell
      title={CVP_SECTION_LABELS[section]}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      <TiptapSectionField
        section={section}
        contentPath={field}
        label={field === "table" ? "Table" : "Content"}
        placeholder={
          field === "table"
            ? "Use the table toolbar to add rows."
            : "Write this section…"
        }
        className="grid gap-2"
        value={doc as JSONContent}
        onChange={(next) =>
          update(() => ({ [field]: next }) as CvpSectionContent)
        }
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

function makeEditor(section: CvpSectionKey): ComponentType {
  function Editor() {
    return <CvpSectionEditor section={section} />;
  }
  Editor.displayName = `CvpEditor_${section}`;
  return Editor;
}

export const CVP_SECTION_EDITORS: Record<CvpSectionKey, ComponentType> =
  Object.fromEntries(
    CVP_SECTION_KEYS.map((key) => [key, makeEditor(key)])
  ) as Record<CvpSectionKey, ComponentType>;
