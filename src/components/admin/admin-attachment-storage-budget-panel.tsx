"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttachmentStorageBudgetStatus } from "@/lib/attachments/storage-budget";

function formatGb(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminAttachmentStorageBudgetPanel({
  initialStatus,
}: {
  initialStatus: AttachmentStorageBudgetStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [limitGb, setLimitGb] = useState(String(Math.round(initialStatus.limitGb)));
  const [savedLimitGb, setSavedLimitGb] = useState(Math.round(initialStatus.limitGb));
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
      const response = await fetch("/api/admin/attachment-storage-budget");
      if (!response.ok) {
        toast.error(
          await readError(response, "Could not refresh attachment storage budget")
        );
        return;
      }
      const data = (await response.json()) as AttachmentStorageBudgetStatus;
      setStatus(data);
      setLimitGb(String(Math.round(data.limitGb)));
      setSavedLimitGb(Math.round(data.limitGb));
      setEnforceHardLimit(data.enforceHardLimit);
      setSavedEnforceHardLimit(data.enforceHardLimit);
    });
  };

  const saveBudgetSettings = () => {
    const limit = Number.parseInt(limitGb, 10);
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error("Enter a valid storage limit in GB");
      return;
    }

    startBudgetSaveTransition(async () => {
      const response = await fetch("/api/admin/attachment-storage-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limitGb: limit,
          enforceHardLimit,
        }),
      });

      if (!response.ok) {
        toast.error(
          await readError(response, "Could not update attachment storage budget")
        );
        return;
      }

      const data = (await response.json()) as AttachmentStorageBudgetStatus;
      setStatus(data);
      setSavedLimitGb(Math.round(data.limitGb));
      setLimitGb(String(Math.round(data.limitGb)));
      setSavedEnforceHardLimit(data.enforceHardLimit);
      setEnforceHardLimit(data.enforceHardLimit);
      toast.success("Attachment storage budget updated");
    });
  };

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Attachment storage</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Total PDF and Word file storage for this workspace. Linking a vault
            file into a report does not count twice. When the hard limit is on,
            new uploads are blocked once stored bytes reach the cap.
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
              {formatGb(status.usedGb)} of {formatGb(status.limitGb)} GB
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
            This cap does not reset monthly. Deleting a file from the vault
            frees space unless it is still attached to a report.
          </p>
          {status.isOverBudget ? (
            <p className="mt-2 text-sm text-red-600">
              Attachment storage limit reached. New uploads are blocked while the
              hard limit is enabled.
            </p>
          ) : status.isWarning ? (
            <p className="mt-2 text-sm text-amber-700">
              Usage is above {status.warningThresholdPercent}% of the storage
              budget.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="attachment-storage-limit-gb">Limit (GB)</Label>
            <Input
              id="attachment-storage-limit-gb"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={limitGb}
              disabled={isSavingBudget}
              onChange={(event) => setLimitGb(event.target.value)}
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
              (Number.parseInt(limitGb, 10) === savedLimitGb &&
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
    </section>
  );
}
