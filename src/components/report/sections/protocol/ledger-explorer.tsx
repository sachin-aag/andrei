"use client";

import { useMemo, useState } from "react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { Input } from "@/components/ui/input";
import { useGenericReportSection, useReportData } from "@/providers/report-provider";
import { asLedger } from "@/lib/document-types/verification-protocol/sections";
import { ProtocolRequirementsVerifiedTable } from "./requirements-verified-view";

export function ProtocolLedgerExplorer() {
  const { report } = useReportData();
  const { value } = useGenericReportSection("design_inputs");
  const ledger = asLedger(value);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ledger.requirements.filter((req) => {
      if (!q) return true;
      return (
        req.id.toLowerCase().includes(q) ||
        req.text.toLowerCase().includes(q) ||
        (req.applicabilityNote ?? "").toLowerCase().includes(q)
      );
    });
  }, [ledger.requirements, query]);

  const codesByReq = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of ledger.scope) {
      const list = map.get(entry.reqId) ?? [];
      if (!list.includes(entry.jCode)) list.push(entry.jCode);
      map.set(entry.reqId, list);
    }
    return map;
  }, [ledger.scope]);

  return (
    <SectionShell
      title="Design Inputs"
      description="Live ledger built from the ingested SRS, plan, and protocol. Search by ID or text."
      showSaveStatus={false}
    >
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search requirement IDs or text"
      />
      <p className="text-sm text-[var(--muted-foreground)]">
        {ledger.requirements.length} IDs ·{" "}
        {ledger.requirements.filter((r) => r.removedInRev === null).length} live ·{" "}
        {ledger.blocks.length} method blocks
      </p>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Applicability</th>
              <th className="px-3 py-2 font-medium">Config codes</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((req) => (
              <tr key={req.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 align-top">
                  <button
                    type="button"
                    className="font-mono text-left hover:underline"
                    onClick={() =>
                      setOpenId((id) => (id === req.id ? null : req.id))
                    }
                  >
                    {req.id}
                  </button>
                  {openId === req.id ? (
                    <p className="mt-2 max-w-xl text-[var(--muted-foreground)]">
                      {req.text}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  {req.removedInRev
                    ? `Removed ${req.removedInRev}`
                    : req.deferred
                      ? "Deferred"
                      : "Live"}
                </td>
                <td className="px-3 py-2 align-top">
                  {req.applicabilityNote ?? "—"}
                </td>
                <td className="px-3 py-2 align-top font-mono">
                  {(codesByReq.get(req.id) ?? []).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 200 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Showing 200 of {rows.length} matches. Narrow the search.
        </p>
      ) : null}
      {report.documentType === "verification_protocol" ? (
        <ProtocolRequirementsVerifiedTable />
      ) : null}
    </SectionShell>
  );
}
