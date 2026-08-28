"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiBudgetStatus } from "@/lib/ai/usage";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFeatureLabel(feature: string): string {
  return feature
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminAiBudgetPanel({
  initialStatus,
}: {
  initialStatus: AiBudgetStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState(
    String(initialStatus.monthlyBudgetUsd)
  );
  const [savedMonthlyBudgetUsd, setSavedMonthlyBudgetUsd] = useState(
    initialStatus.monthlyBudgetUsd
  );
  const [enforceHardLimit, setEnforceHardLimit] = useState(
    initialStatus.enforceHardLimit
  );
  const [savedEnforceHardLimit, setSavedEnforceHardLimit] = useState(
    initialStatus.enforceHardLimit
  );
  const [isSavingBudget, startBudgetSaveTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  const progressPercent = Math.min(100, Math.max(0, status.percentUsed));
  const progressTone = status.isOverBudget
    ? "bg-red-500"
    : status.isWarning
      ? "bg-amber-500"
      : "bg-[var(--brand-600)]";

  const refreshStatus = () => {
    startRefreshTransition(async () => {
      const response = await fetch("/api/admin/ai-budget");
      if (!response.ok) {
        toast.error(await readError(response, "Could not refresh AI budget"));
        return;
      }
      const data = (await response.json()) as AiBudgetStatus;
      setStatus(data);
      setMonthlyBudgetUsd(String(data.monthlyBudgetUsd));
      setSavedMonthlyBudgetUsd(data.monthlyBudgetUsd);
      setEnforceHardLimit(data.enforceHardLimit);
      setSavedEnforceHardLimit(data.enforceHardLimit);
    });
  };

  const saveBudgetSettings = () => {
    const budget = Number.parseFloat(monthlyBudgetUsd);
    if (!Number.isFinite(budget) || budget < 0) {
      toast.error("Enter a valid monthly budget in USD");
      return;
    }

    startBudgetSaveTransition(async () => {
      const response = await fetch("/api/admin/ai-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudgetUsd: budget,
          enforceHardLimit,
        }),
      });

      if (!response.ok) {
        toast.error(await readError(response, "Could not update AI budget"));
        return;
      }

      const data = (await response.json()) as AiBudgetStatus;
      setStatus(data);
      setSavedMonthlyBudgetUsd(data.monthlyBudgetUsd);
      setMonthlyBudgetUsd(String(data.monthlyBudgetUsd));
      setSavedEnforceHardLimit(data.enforceHardLimit);
      setEnforceHardLimit(data.enforceHardLimit);
      toast.success("AI budget updated");
    });
  };

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">AI monthly budget</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Gemini usage for this deployment resets on the first day of each month
            (UTC). When the hard limit is on, AI features stop once spend reaches
            the cap.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRefreshing}
          onClick={refreshStatus}
        >
          {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">
              {formatUsd(status.currentMonthSpendUsd)} of{" "}
              {formatUsd(status.monthlyBudgetUsd)}
            </span>
            <span className="text-[var(--muted-foreground)]">
              {status.percentUsed.toFixed(1)}% used
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className={`h-full rounded-full transition-all ${progressTone}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Billing cycle: {status.yearMonth} (
            {new Date(status.cycleStart).toLocaleDateString()} –{" "}
            {new Date(status.cycleEnd).toLocaleDateString()} UTC)
          </p>
          {status.isOverBudget ? (
            <p className="mt-2 text-sm text-red-600">
              Monthly AI budget exceeded. New Gemini calls are blocked while the
              hard limit is enabled.
            </p>
          ) : status.isWarning ? (
            <p className="mt-2 text-sm text-amber-700">
              Usage is above {status.warningThresholdPercent}% of the monthly
              budget.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="ai-monthly-budget-usd">Monthly limit (USD)</Label>
            <Input
              id="ai-monthly-budget-usd"
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              value={monthlyBudgetUsd}
              disabled={isSavingBudget}
              onChange={(event) => setMonthlyBudgetUsd(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-[var(--border)]"
              checked={enforceHardLimit}
              disabled={isSavingBudget}
              onChange={(event) => setEnforceHardLimit(event.target.checked)}
            />
            Enforce hard limit
          </label>
          <Button
            type="button"
            disabled={
              isSavingBudget ||
              (Number.parseFloat(monthlyBudgetUsd) === savedMonthlyBudgetUsd &&
                enforceHardLimit === savedEnforceHardLimit)
            }
            onClick={saveBudgetSettings}
          >
            {isSavingBudget ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Save budget"
            )}
          </Button>
        </div>
      </div>

      {status.featureBreakdown.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium">Spend</th>
                <th className="py-2 pr-4 font-medium">Input tokens</th>
                <th className="py-2 font-medium">Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {status.featureBreakdown.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-2 pr-4">{formatFeatureLabel(row.feature)}</td>
                  <td className="py-2 pr-4">{formatUsd(row.spendUsd)}</td>
                  <td className="py-2 pr-4">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-2">{row.outputTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          No Gemini usage recorded for this month yet.
        </p>
      )}
    </section>
  );
}
