"use client";

import type { ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { useGenericReportSection } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  EMPTY_QSR_CONTENT,
  QSR_SECTION_KEYS,
  QSR_SECTION_LABELS,
  isQsrTableSectionKey,
  type QsrSectionContent,
  type QsrSectionKey,
} from "@/lib/document-types/qsr/sections";

const TABLE_DESCRIPTION =
  "Keep the header columns unchanged. Select cells and Merge for a group heading, or put only bold text in the first cell.";

function sectionDescription(section: QsrSectionKey): string | undefined {
  if (section === "qsr_volumetric_details") {
    return "One bold heading line, then each Parameter / Details table. The Word export keeps the form layout.";
  }
  if (section === "qsr_qualification_documents") {
    return "Select the protocol and report cells and Merge, or leave Document Name blank on the report row so Word still merges them.";
  }
  if (section === "qsr_operating_range") {
    return "Range is only used for Temperature; leave it blank elsewhere and the Details cell spans both columns.";
  }
  return isQsrTableSectionKey(section) ? TABLE_DESCRIPTION : undefined;
}

function QsrSectionEditor({ section }: { section: QsrSectionKey }) {
  const { update } = useGenericReportSection<QsrSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content =
    (value as QsrSectionContent | undefined) ?? EMPTY_QSR_CONTENT[section];
  const field = isQsrTableSectionKey(section) ? "table" : "narrative";
  const doc = (content as Record<string, JSONContent | undefined>)[field];

  return (
    <SectionShell
      title={QSR_SECTION_LABELS[section]}
      description={sectionDescription(section)}
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
          update(() => ({ [field]: next }) as QsrSectionContent)
        }
        onFlushSave={flushSave}
      />
    </SectionShell>
  );
}

function makeEditor(section: QsrSectionKey): ComponentType {
  function Editor() {
    return <QsrSectionEditor section={section} />;
  }
  Editor.displayName = `QsrEditor_${section}`;
  return Editor;
}

export const QSR_SECTION_EDITORS: Record<QsrSectionKey, ComponentType> =
  Object.fromEntries(
    QSR_SECTION_KEYS.map((key) => [key, makeEditor(key)])
  ) as Record<QsrSectionKey, ComponentType>;
