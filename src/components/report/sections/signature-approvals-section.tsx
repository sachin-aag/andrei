"use client";

import { useReportSections } from "@/providers/report-provider";
import { EMPTY_CONTENT } from "@/types/sections";
import { Label } from "@/components/ui/label";
import { SectionShell } from "./section-shell";
import { SignatureApprovalsTable } from "./signature-approvals-table";

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
      <div className="grid gap-2">
        <Label>Prepared / reviewed / approved</Label>
        <SignatureApprovalsTable table={table} />
      </div>
    </SectionShell>
  );
}
