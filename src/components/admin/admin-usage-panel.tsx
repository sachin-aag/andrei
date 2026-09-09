"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { UserSpendReport } from "@/lib/ai/usage";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUtcDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminUsagePanel({
  initialReport,
}: {
  initialReport: UserSpendReport;
}) {
  const [report, setReport] = useState(initialReport);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const refresh = () => {
    startRefreshTransition(async () => {
      const response = await fetch("/api/admin/usage");
      if (!response.ok) {
        toast.error(await readError(response, "Could not refresh usage"));
        return;
      }
      setReport((await response.json()) as UserSpendReport);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-10 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Estimated Gemini spend for the {report.instanceLabel} instance (
              {report.productName}). Sachin and Aditya are omitted. Open Usage
              on Demo, MJ, and Convergent separately — each deployment has its
              own database.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={refresh}
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-6">
        <div className="grid max-w-5xl gap-4">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="text-sm text-[var(--muted-foreground)]">This week</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatUsd(report.weekTotalUsd)}
              </p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {formatUtcDate(report.weekStart)} –{" "}
                {formatUtcDate(
                  new Date(Date.parse(report.weekEnd) - 1).toISOString()
                )}{" "}
                UTC (Mon–Sun)
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="text-sm text-[var(--muted-foreground)]">This month</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatUsd(report.monthTotalUsd)}
              </p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {report.yearMonth} ({formatUtcDate(report.cycleStart)} –{" "}
                {formatUtcDate(report.cycleEnd)} UTC)
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Spend by user</h2>
            {report.users.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                No workspace users to show for this instance.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="py-2 pr-4 font-medium">User</th>
                      <th className="py-2 pr-4 font-medium">This week</th>
                      <th className="py-2 font-medium">This month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.users.map((row) => (
                      <tr
                        key={row.userId ?? "unattributed"}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="py-2 pr-4">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {row.email ?? "No user on the usage event"}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          {formatUsd(row.weekSpendUsd)}
                        </td>
                        <td className="py-2">{formatUsd(row.monthSpendUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
