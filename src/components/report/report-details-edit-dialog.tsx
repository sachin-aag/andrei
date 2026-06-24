"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManagerSelector } from "@/components/report/manager-selector";
import { assignedManagerIdsForReport } from "@/lib/reports/managers";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import type { ReportRecord } from "@/types/report";

type ManagerOption = Pick<WorkspaceUser, "id" | "name" | "title">;

function ReportDetailsEditForm({
  report,
  managers,
  onSaved,
  onClose,
}: {
  report: ReportRecord;
  managers: ManagerOption[];
  onSaved: (report: ReportRecord) => void;
  onClose: () => void;
}) {
  const [deviationNo, setDeviationNo] = useState(report.deviationNo);
  const [assignedManagerIds, setAssignedManagerIds] = useState<string[]>(() =>
    assignedManagerIdsForReport(report)
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmedDeviationNo = deviationNo.trim();
    if (!trimmedDeviationNo) {
      toast.error("Deviation number is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviationNo: trimmedDeviationNo,
          assignedManagerIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Could not save report details");
        return;
      }
      const data = (await res.json()) as { report: ReportRecord };
      onSaved(data.report);
      toast.success("Report details updated");
      onClose();
    } catch {
      toast.error("Could not save report details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 py-1">
        <div className="grid gap-2">
          <Label htmlFor="edit-deviation-no">Deviation number</Label>
          <Input
            id="edit-deviation-no"
            placeholder="e.g. DEV/PK/26/001"
            value={deviationNo}
            disabled={saving}
            onChange={(event) => setDeviationNo(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>Reviewer managers (optional)</Label>
          <ManagerSelector
            managers={managers}
            selectedIds={assignedManagerIds}
            disabled={saving}
            onSelectedIdsChange={setAssignedManagerIds}
            emptyMessage="No managers are available to assign."
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ReportDetailsEditDialog({
  open,
  onOpenChange,
  report,
  managers,
  onSaved,
  formKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ReportRecord;
  managers: ManagerOption[];
  onSaved: (report: ReportRecord) => void;
  formKey: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit report details</DialogTitle>
          <DialogDescription>
            Update the deviation number and reviewer managers for this report.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ReportDetailsEditForm
            key={formKey}
            report={report}
            managers={managers}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
