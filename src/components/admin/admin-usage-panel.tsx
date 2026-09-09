"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  formatActiveDuration,
  type UserActivityReport,
} from "@/lib/usage/activity";

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
  initialReport: UserActivityReport;
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
      setReport((await response.json()) as UserActivityReport);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-10 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Time in the {report.instanceLabel} app ({report.productName}) while
              a tab is open and visible. Sachin and Aditya are omitted. Open
              Usage on Demo, MJ, and Convergent separately — each deployment has
              its own database.
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
          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Daily active users"
              value={String(report.dailyActiveUsers)}
              hint={`${report.today} UTC`}
            />
            <MetricCard
              label="Weekly active users"
              value={String(report.weeklyActiveUsers)}
              hint={`${formatUtcDate(report.weekStart)} – ${formatUtcDate(
                new Date(Date.parse(report.weekEnd) - 1).toISOString()
              )} UTC`}
            />
            <MetricCard
              label="Monthly active users"
              value={String(report.monthlyActiveUsers)}
              hint={`${report.yearMonth} UTC`}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Time this week"
              value={formatActiveDuration(report.weekTotalSeconds)}
              hint="Everyone except Sachin and Aditya"
            />
            <MetricCard
              label="Time this month"
              value={formatActiveDuration(report.monthTotalSeconds)}
              hint="Everyone except Sachin and Aditya"
            />
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Time by user</h2>
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
                        key={row.userId}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="py-2 pr-4">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {row.email}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          {formatActiveDuration(row.weekActiveSeconds)}
                        </td>
                        <td className="py-2">
                          {formatActiveDuration(row.monthActiveSeconds)}
                        </td>
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

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">{hint}</p>
    </div>
  );
}
