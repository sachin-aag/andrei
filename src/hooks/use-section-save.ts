"use client";

import { useCallback } from "react";
import { useReport } from "@/providers/report-provider";
import { useAutoSave } from "./use-auto-save";
import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";

export function useSectionSave<K extends keyof SectionContentMap & SectionType>(
  section: K
) {
  const { sections, report, readOnly } = useReport();
  const value = sections[section] as SectionContentMap[K];

  const onSave = useCallback(
    async (v: SectionContentMap[K]) => {
      const res = await fetch(
        `/api/reports/${report.id}/sections/${section}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: v }),
        }
      );
      if (!res.ok) throw new Error("Save failed");
    },
    [report.id, section]
  );

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly,
    value,
    onSave,
    beaconUrl: `/api/reports/${report.id}/sections/${section}`,
    serialize: (v) => JSON.stringify({ content: v }),
  });

  return { status, lastSavedAt, value };
}
