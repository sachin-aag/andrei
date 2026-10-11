"use client";

import { useEffect, type ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { CvpEquipmentSamplingEditor } from "@/components/report/sections/cvp/cvp-equipment-sampling-editor";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  EMPTY_CVP_CONTENT,
  EMPTY_CVP_LEGACY_CONTENT,
  CVP_LEGACY_SECTION_KEYS,
  CVP_SECTION_KEYS,
  CVP_SECTION_LABELS,
  alignCvpMacoEquipmentHeaders,
  isCvpLegacySectionKey,
  isCvpTableSectionKey,
  type CvpPersistableSectionKey,
  type CvpSectionContent,
} from "@/lib/document-types/cvp/sections";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";

function emptyCvpSection(section: CvpPersistableSectionKey): CvpSectionContent {
  return isCvpLegacySectionKey(section)
    ? EMPTY_CVP_LEGACY_CONTENT[section]
    : EMPTY_CVP_CONTENT[section];
}

function CvpSectionEditor({ section }: { section: CvpPersistableSectionKey }) {
  const { readOnly } = useReportData();
  const { update } = useGenericReportSection<CvpSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(section);
  const content =
    (value as CvpSectionContent | undefined) ?? emptyCvpSection(section);
  const field = isCvpTableSectionKey(section) ? "table" : "narrative";
  const stored = (content as Record<string, JSONContent | undefined>)[field];
  const doc =
    section === "cvp_maco" && stored
      ? alignCvpMacoEquipmentHeaders(stored)
      : stored;

  useEffect(() => {
    if (section !== "cvp_maco" || readOnly || !stored || doc === stored) return;
    update(() => ({ narrative: doc }) as CvpSectionContent);
  }, [section, readOnly, stored, doc, update]);

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

function makeEditor(section: CvpPersistableSectionKey): ComponentType {
  if (section === "cvp_equipment_sampling") return CvpEquipmentSamplingEditor;
  function Editor() {
    return <CvpSectionEditor section={section} />;
  }
  Editor.displayName = `CvpEditor_${section}`;
  return Editor;
}

export const CVP_SECTION_EDITORS: Record<
  CvpPersistableSectionKey,
  ComponentType
> = Object.fromEntries(
  [...CVP_SECTION_KEYS, ...CVP_LEGACY_SECTION_KEYS].map((key) => [
    key,
    makeEditor(key),
  ])
) as Record<CvpPersistableSectionKey, ComponentType>;
