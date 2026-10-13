"use client";

import { contextForPrompt } from "@/lib/ai/section-context";
import { getWorkspaceSections } from "@/lib/document-types";
import { cvpWorkspaceSectionDefs } from "@/lib/document-types/cvp/sections";
import { useReportData, useReportSections } from "@/providers/report-provider";

/**
 * Second view of the report. The live editor stays in the top-left pane, so
 * this surface only reads the saved section text and keeps its own scroll.
 */
export function ReportMirror() {
  const { report } = useReportData();
  const { sections } = useReportSections();
  const sectionList =
    report.documentType === "cleaning_verification_protocol"
      ? cvpWorkspaceSectionDefs(sections)
      : getWorkspaceSections(report.documentType);

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-6 py-5">
      <p className="mb-4 text-xs text-[var(--muted-foreground)]">
        View only. Edits stay in the top-left report.
      </p>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-16">
        {sectionList.map((section) => {
          const text = contextForPrompt(
            section.key,
            sections[section.key as keyof typeof sections]
          ).trim();
          if (!text) return null;
          return (
            <section
              key={section.key}
              data-mirror-section={section.key}
              className="min-w-0"
            >
              <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
                {section.label}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
                {text}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
