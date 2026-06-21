"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, Download, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { auditEvents } from "@/db/schema";

type AuditEventRow = typeof auditEvents.$inferSelect;

type GlobalAuditPayload = {
  events: AuditEventRow[];
  chainVerification: {
    valid: boolean;
    message: string;
  };
};

export function AdminAuditPanel() {
  const [data, setData] = useState<GlobalAuditPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/audit");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground p-6">Loading audit trail…</p>;
  }

  if (!data) {
    return <p className="text-sm text-destructive p-6">Failed to load audit trail.</p>;
  }

  const ChainIcon = data.chainVerification.valid ? ShieldCheck : ShieldX;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/users">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Admin
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Global Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            Recent system-wide audit events including admin and auth actions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/audit?format=csv">
              <Download className="size-4 mr-1" aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/audit?format=pdf">
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
        <ChainIcon className="size-5 mt-0.5" aria-hidden="true" />
        <p className="text-sm">{data.chainVerification.message}</p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Who</th>
              <th className="p-3">Action</th>
              <th className="p-3">Report</th>
              <th className="p-3">Summary</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id} className="border-t align-top">
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {format(new Date(event.createdAt), "PPpp")}
                </td>
                <td className="p-3">{event.actorName}</td>
                <td className="p-3 font-mono text-xs">{event.action}</td>
                <td className="p-3">
                  {event.reportId ? (
                    <Link
                      href={`/reports/${event.reportId}/audit`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      View
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">{event.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
