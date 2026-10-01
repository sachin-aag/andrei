"use client";

import { useEffect, useMemo, type ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  EMPTY_QSR_CONTENT,
  QSR_SECTION_KEYS,
  QSR_SECTION_LABELS,
  QSR_TABLE_HEADERS,
  ensureRtmFamilyColumns,
  ensureVolumetricFormRows,
  isQsrTableSectionKey,
  shapeOperatingRangeTable,
  type QsrSectionContent,
  type QsrSectionKey,
} from "@/lib/document-types/qsr/sections";

function QsrSectionEditor({ section }: { section: QsrSectionKey }) {
  const { readOnly } = useReportData();
  const { update } = useGenericReportSection<QsrSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const content =
    (value as QsrSectionContent | undefined) ?? EMPTY_QSR_CONTENT[section];
  const field = isQsrTableSectionKey(section) ? "table" : "narrative";
  const doc = (content as Record<string, JSONContent | undefined>)[field];
  const shown = useMemo(() => {
    if (!doc) return doc;
    if (section === "qsr_operating_range") return shapeOperatingRangeTable(doc);
    if (section === "qsr_volumetric_details") return ensureVolumetricFormRows(doc);
    if (isQsrTableSectionKey(section) && section.startsWith("qsr_rtm_")) {
      return ensureRtmFamilyColumns(doc, QSR_TABLE_HEADERS[section]);
    }
    return doc;
  }, [section, doc]);

  useEffect(() => {
    if (readOnly || !doc || !shown || shown === doc) return;
    if (!(isQsrTableSectionKey(section) && section.startsWith("qsr_rtm_"))) {
      return;
    }
    update(() => ({ [field]: shown }) as QsrSectionContent);
  }, [doc, field, readOnly, section, shown, update]);

  return (
    <SectionShell
      title={QSR_SECTION_LABELS[section]}
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
        value={shown as JSONContent}
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
