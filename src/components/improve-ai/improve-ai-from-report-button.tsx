"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImproveAiStaleRerunDialog } from "@/components/improve-ai/improve-ai-stale-rerun-dialog";
import { startImproveAiFromReport } from "@/lib/improve-ai/client";

export type ImproveAiReportOption = {
  id: string;
  deviationNo: string;
};

export function ImproveAiFromReportButton({
  reports,
}: {
  reports: ImproveAiReportOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmRerunOpen, setConfirmRerunOpen] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusy = submitting || confirmingRerun;

  const resetForm = () => {
    setSelectedReportId("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isBusy) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const startFromSelectedReport = async (confirmRerun: boolean) => {
    const result = await startImproveAiFromReport(selectedReportId, {
      confirmRerun,
    });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (result.needsConfirmation) {
      setConfirmRerunOpen(true);
      return false;
    }
    setOpen(false);
    router.push(`/improve-ai/${encodeURIComponent(result.sessionId)}`);
    router.refresh();
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedReportId) {
      setError("Pick a report from your dashboard");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await startFromSelectedReport(false);
    } catch {
      setError("Could not start evaluation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        Evaluate report
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          onInteractOutside={(event) => {
            if (isBusy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isBusy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-[var(--brand-500)]" />
              Evaluate with AI
            </DialogTitle>
            <DialogDescription>
              Choose one of your investigation reports from the dashboard. We
              will run criteria evaluation and open a feedback session for you.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label>Existing report</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedReportId || undefined}
                  onValueChange={setSelectedReportId}
                  disabled={isBusy || reports.length === 0}
                >
                  <SelectTrigger className="min-w-[240px] flex-1">
                    <SelectValue placeholder="Pick a report from your dashboard" />
                  </SelectTrigger>
                  <SelectContent>
                    {reports.map((report) => (
                      <SelectItem key={report.id} value={report.id}>
                        {report.deviationNo || "Untitled deviation"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedReportId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-[var(--muted-foreground)]"
                    disabled={isBusy}
                    onClick={() => setSelectedReportId("")}
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                ) : null}
              </div>
              {reports.length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Create a report on the dashboard first.
                </p>
              )}
            </div>

            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isBusy} onClick={handleSubmit}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? "Starting…" : "Evaluate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImproveAiStaleRerunDialog
        open={confirmRerunOpen}
        onOpenChange={(next) => {
          if (!confirmingRerun) setConfirmRerunOpen(next);
        }}
        pending={confirmingRerun}
        onConfirm={async () => {
          setConfirmingRerun(true);
          setError(null);
          try {
            const navigated = await startFromSelectedReport(true);
            if (navigated) setConfirmRerunOpen(false);
          } catch {
            setError("Could not start evaluation");
          } finally {
            setConfirmingRerun(false);
          }
        }}
      />
    </>
  );
}
