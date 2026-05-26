"use client";

import { useReportSections } from "@/providers/report-provider";
import { EMPTY_CONTENT } from "@/types/sections";
import { SectionShell } from "./section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";

export function SignatureApprovalsSection() {
  const { sections } = useReportSections();
  const value = sections.signature_approvals ?? EMPTY_CONTENT.signature_approvals;
  const table = value.table;

  if (!table?.content?.length) {
    return null;
  }

  return (
    <SectionShell
      title="Approvals (QC / QA)"
      description="Sign-off block from the uploaded investigation report. Column layout is preserved on export."
    >
      <TiptapSectionField
        section="signature_approvals"
        contentPath="table"
        label="Prepared / reviewed / approved"
        className="grid gap-2"
        value={table}
        onChange={() => {}}
        locked
        compact
        placeholder=""
      />
    </SectionShell>
  );
}
