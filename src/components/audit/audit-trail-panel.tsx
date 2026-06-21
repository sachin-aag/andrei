"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, Download, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { auditEvents, electronicSignatures } from "@/db/schema";

type AuditEventRow = typeof auditEvents.$inferSelect;
type SignatureRow = typeof electronicSignatures.$inferSelect;

type SectionVersionRow = {
  id: string;
  section: string;
  versionNo: number;
  isSnapshot: boolean;
  contentHash: string;
  auditEventId: string;
  createdAt: string;
};

type AuditPayload = {
  events: AuditEventRow[];
  signatures: SignatureRow[];
  sectionVersions: SectionVersionRow[];
  chainVerification: {
    valid: boolean;
    totalEvents: number;
    message: string;
  };
};

function formatJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditTrailPanel({ reportId }: { reportId: string }) {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/audit`);
      if (!res.ok) throw new Error("Failed to load audit trail");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground p-6">Loading audit trail…</p>;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive p-6">{error ?? "Audit trail unavailable"}</p>
    );
  }

  const ChainIcon = data.chainVerification.valid ? ShieldCheck : ShieldX;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href={`/reports/${reportId}/edit`}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back to report
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Audit Trail</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Part 11 record of who did what and when for this investigation report.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/reports/${reportId}/audit/export?format=csv`}>
              <Download className="size-4 mr-1" aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/reports/${reportId}/audit/export?format=pdf`}>
              <Download className="size-4 mr-1" aria-hidden="true" />
              Export PDF
            </a>
          </Button>
        </div>
      </div>

      <div
        className={`flex items-start gap-3 rounded-lg border p-4 ${
          data.chainVerification.valid
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5"
        }`}
      >
        <ChainIcon className="size-5 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">
            Chain verification: {data.chainVerification.valid ? "Valid" : "Invalid"}
          </p>
          <p className="text-sm text-muted-foreground">{data.chainVerification.message}</p>
        </div>
      </div>

      {data.signatures.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Electronic Signatures</h2>
          <div className="rounded-lg border divide-y">
            {data.signatures.map((sig) => (
              <div key={sig.id} className="p-4 text-sm">
                <p className="font-medium">{sig.signerName}</p>
                <p className="text-muted-foreground capitalize">{sig.meaning}</p>
                <p className="text-muted-foreground">
                  {format(new Date(sig.signedAt), "PPpp")} · {sig.authMethod}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Events</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Who</th>
                <th className="p-3 font-medium">Action</th>
                <th className="p-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {format(new Date(event.createdAt), "PPpp")}
                  </td>
                  <td className="p-3">
                    <div>{event.actorName}</div>
                    <div className="text-xs text-muted-foreground">{event.actorRole}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{event.action}</td>
                  <td className="p-3">
                    <div>{event.summary}</div>
                    {event.oldValue != null || event.newValue != null ? (
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Values</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all">
                          {event.oldValue
                            ? `Old:\n${formatJson(event.oldValue)}\n`
                            : ""}
                          {event.newValue
                            ? `New:\n${formatJson(event.newValue)}`
                            : ""}
                        </pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.sectionVersions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Section Version History</h2>
          <div className="rounded-lg border divide-y">
            {data.sectionVersions.map((v) => (
              <div key={v.id} className="p-4 text-sm flex flex-wrap gap-x-4 gap-y-1">
                <span className="font-medium capitalize">{v.section}</span>
                <span>v{v.versionNo}</span>
                <span className="text-muted-foreground">
                  {v.isSnapshot ? "snapshot" : "diff"}
                </span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  {v.contentHash.slice(0, 12)}…
                </span>
                <span className="text-muted-foreground">
                  {format(new Date(v.createdAt), "PPpp")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
