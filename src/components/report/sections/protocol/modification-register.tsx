"use client";

import { SectionShell } from "@/components/report/sections/section-shell";
import { asModificationRegister } from "@/lib/document-types/verification-protocol/sections";
import { useGenericReportSection } from "@/providers/report-provider";

export function ProtocolModificationRegister() {
  const { value } = useGenericReportSection("modification_register");
  const accepted = asModificationRegister(value).rows.filter(
    (row) => row.status === "accepted"
  );

  return (
    <SectionShell
      title="Modification Register"
      description="Accepted proposed fixes only. This is the SOP §8.6 artifact pulled into the test report."
      showSaveStatus={false}
      section="modification_register"
    >
      {accepted.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No accepted modifications yet. Accept a finding to add a row.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">After</th>
                <th className="px-3 py-2 font-medium">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {accepted.map((row) => (
                <tr key={row.findingId} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 align-top">{row.target}</td>
                  <td className="px-3 py-2 align-top">{row.kind}</td>
                  <td className="px-3 py-2 align-top">{row.after}</td>
                  <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                    {row.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}
