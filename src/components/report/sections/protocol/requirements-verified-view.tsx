"use client";

import { useMemo } from "react";
import { requirementsVerifiedRows } from "@/lib/design-inputs/requirements-verified";
import { asLedger } from "@/lib/document-types/verification-protocol/sections";
import { useGenericReportSection } from "@/providers/report-provider";

export function ProtocolRequirementsVerifiedTable() {
  const { value } = useGenericReportSection("design_inputs");
  const rows = useMemo(
    () => requirementsVerifiedRows(asLedger(value)),
    [value]
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Requirements Verified</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        Generated from the ledger. Every live requirement is a row. There is no
        pass/fail column — this is a pre-execution scaffold.
      </p>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Req ID</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Satisfied by</th>
              <th className="px-3 py-2 font-medium">Required configs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reqId} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 align-top font-mono">{row.reqId}</td>
                <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                  {row.description.slice(0, 180)}
                  {row.description.length > 180 ? "…" : ""}
                </td>
                <td className="px-3 py-2 align-top">{row.satisfiedBy || "—"}</td>
                <td className="px-3 py-2 align-top">
                  {row.requiredConfigs.join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
