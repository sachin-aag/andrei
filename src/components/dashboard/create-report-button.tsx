"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { captureEvent } from "@/lib/analytics/events";
import { ManagerSelector } from "@/components/report/manager-selector";

type CreateReportButtonProps = {
  managers: Pick<WorkspaceUser, "id" | "name" | "title">[];
};

export function CreateReportButton({ managers }: CreateReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [deviationNo, setDeviationNo] = useState("");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const resetForm = () => {
    setDeviationNo("");
    setManagerIds([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && pending) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const submit = () => {
    if (!deviationNo.trim()) {
      toast.error("Deviation number is required");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviationNo: deviationNo.trim(),
          assignedManagerIds: managerIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to create report");
        return;
      }
      const data = (await res.json()) as { id: string };
      captureEvent("report_created", {
        reportId: data.id,
        fromDocx: false,
      });
      toast.success("Report created");
      setOpen(false);
      resetForm();
      router.push(`/reports/${data.id}/edit`);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Report
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="relative">
          {pending && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--card)]/85 backdrop-blur-[1px]"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="size-5 animate-spin text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--muted-foreground)]">
                Creating report…
              </p>
            </div>
          )}
          <DialogHeader>
            <DialogTitle>Create investigation report</DialogTitle>
            <DialogDescription>
              Starts a new deviation investigation report as a draft.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="deviationNo">Deviation Number</Label>
              <Input
                id="deviationNo"
                placeholder="e.g. DEV/PK/26/001"
                value={deviationNo}
                disabled={pending}
                onChange={(e) => setDeviationNo(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Reviewer managers (optional)</Label>
              <ManagerSelector
                managers={managers}
                selectedIds={managerIds}
                onSelectedIdsChange={setManagerIds}
                disabled={pending}
                emptyMessage="No managers are available to assign."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
