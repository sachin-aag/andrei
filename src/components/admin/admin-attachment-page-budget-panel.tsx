"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttachmentPageBudgetStatus } from "@/lib/attachments/page-budget";

function formatPageCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminAttachmentPageBudgetPanel({
  initialStatus,
}: {
  initialStatus: AttachmentPageBudgetStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [monthlyPageLimit, setMonthlyPageLimit] = useState(
    String(initialStatus.monthlyPageLimit)
  );
  const [savedMonthlyPageLimit, setSavedMonthlyPageLimit] = useState(
    initialStatus.monthlyPageLimit
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
      const response = await fetch("/api/admin/attachment-page-budget");
      if (!response.ok) {
        toast.error(
          await readError(response, "Could not refresh attachment page budget")
        );
        return;
      }
      const data = (await response.json()) as AttachmentPageBudgetStatus;
      setStatus(data);
      setMonthlyPageLimit(String(data.monthlyPageLimit));
      setSavedMonthlyPageLimit(data.monthlyPageLimit);
      setEnforceHardLimit(data.enforceHardLimit);
      setSavedEnforceHardLimit(data.enforceHardLimit);
    });
  };

  const saveBudgetSettings = () => {
    const limit = Number.parseInt(monthlyPageLimit, 10);
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error("Enter a valid monthly page limit");
      return;
    }

    startBudgetSaveTransition(async () => {
      const response = await fetch("/api/admin/attachment-page-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyPageLimit: limit,
          enforceHardLimit,
        }),
      });

      if (!response.ok) {
        toast.error(
          await readError(response, "Could not update attachment page budget")
        );
        return;
      }

      const data = (await response.json()) as AttachmentPageBudgetStatus;
      setStatus(data);
      setSavedMonthlyPageLimit(data.monthlyPageLimit);
      setMonthlyPageLimit(String(data.monthlyPageLimit));
      setSavedEnforceHardLimit(data.enforceHardLimit);
      setEnforceHardLimit(data.enforceHardLimit);
      toast.success("Attachment page budget updated");
    });
  };

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Attachment page budget</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            PDF and Word attachment processing for this deployment resets on the
            first day of each month (UTC). When the hard limit is on, new ingest
            jobs are blocked once processed pages reach the cap.
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
              {formatPageCount(status.totalCommittedPageCount)} of{" "}
              {formatPageCount(status.monthlyPageLimit)} pages
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
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {formatPageCount(status.currentMonthPageCount)} pages completed,{" "}
            {formatPageCount(status.inFlightPageCount)} in flight
          </p>
          {status.isOverBudget ? (
            <p className="mt-2 text-sm text-red-600">
              Monthly attachment page budget exceeded. New document ingest is
              blocked while the hard limit is enabled.
            </p>
          ) : status.isWarning ? (
            <p className="mt-2 text-sm text-amber-700">
              Usage is above {status.warningThresholdPercent}% of the monthly
              page budget.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="attachment-monthly-page-limit">
              Monthly limit (pages)
            </Label>
            <Input
              id="attachment-monthly-page-limit"
              type="number"
              min={0}
              step="1000"
              inputMode="numeric"
              value={monthlyPageLimit}
              disabled={isSavingBudget}
              onChange={(event) => setMonthlyPageLimit(event.target.value)}
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
              (Number.parseInt(monthlyPageLimit, 10) === savedMonthlyPageLimit &&
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

      {status.eventCount > 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          {formatPageCount(status.eventCount)} completed ingest runs recorded
          this month.
        </p>
      ) : (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          No attachment pages processed this month yet.
        </p>
      )}
    </section>
  );
}
