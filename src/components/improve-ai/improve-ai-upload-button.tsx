"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImproveAiStaleRerunDialog } from "@/components/improve-ai/improve-ai-stale-rerun-dialog";
import { ManagerSelector } from "@/components/report/manager-selector";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { startImproveAiFromReport } from "@/lib/improve-ai/client";

export type ImproveAiReportOption = {
  id: string;
  deviationNo: string;
};

type ManagerOption = Pick<WorkspaceUser, "id" | "name" | "title">;

export function ImproveAiUploadButton({
  reports,
  managers,
}: {
  reports: ImproveAiReportOption[];
  managers: ManagerOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [deviationNo, setDeviationNo] = useState("");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmRerunOpen, setConfirmRerunOpen] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusy = submitting || previewLoading || confirmingRerun;

  const resetForm = () => {
    setSelectedReportId("");
    setDeviationNo("");
    setManagerIds([]);
    setDraftFile(null);
    setPreviewLoading(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isBusy) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const handleFileChange = async (file: File | null) => {
    setDraftFile(file);
    setSelectedReportId("");
    if (!file) {
      setPreviewLoading(false);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/reports/import-preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not read that Word file");
        return;
      }
      const data = (await res.json()) as { deviationNo?: string | null };
      if (data.deviationNo) {
        setDeviationNo(data.deviationNo);
      }
    } catch {
      setError("Could not read that Word file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleReportSelect = (reportId: string) => {
    setSelectedReportId(reportId);
    setDraftFile(null);
    setDeviationNo("");
    setManagerIds([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
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
    if (selectedReportId && !draftFile) {
      setSubmitting(true);
      setError(null);
      try {
        await startFromSelectedReport(false);
      } catch {
        setError("Could not start evaluation");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!draftFile) {
      setError("Pick an existing report or upload a .docx file");
      return;
    }

    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append("file", draftFile);
    if (deviationNo.trim()) form.append("deviationNo", deviationNo.trim());
    for (const managerId of managerIds) {
      form.append("assignedManagerIds", managerId);
    }

    try {
      const res = await fetch("/api/improve-ai/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setOpen(false);
      router.push(`/improve-ai/${encodeURIComponent(data.sessionId)}`);
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = selectedReportId && !draftFile
    ? submitting
      ? "Starting…"
      : "Evaluate"
    : submitting
      ? "Uploading…"
      : "Upload & evaluate";

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
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
              Choose one of your investigation reports from the dashboard, or
              upload a new Word document (.docx). We will run criteria evaluation
              and open a feedback session for you.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label>Existing report</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedReportId || undefined}
                  onValueChange={handleReportSelect}
                  disabled={isBusy || !!draftFile || reports.length === 0}
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
                  Create a report on the dashboard first, or upload a new file
                  below.
                </p>
              )}
            </div>

            <p className="text-center text-xs text-[var(--muted-foreground)]">
              or upload a new report
            </p>

            <div className="grid gap-2">
              <Label htmlFor="improve-ai-file">Word document (.docx)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="improve-ai-file"
                  ref={fileRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="cursor-pointer file:mr-3 file:inline-flex file:items-center file:justify-start file:rounded-md file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1 file:text-left file:text-sm"
                  disabled={isBusy || !!selectedReportId}
                  onChange={(e) => {
                    void handleFileChange(e.target.files?.[0] ?? null);
                  }}
                />
                {draftFile && (
                  <>
                    <span className="flex max-w-[200px] items-center gap-1.5 truncate text-xs text-[var(--muted-foreground)]">
                      {previewLoading ? (
                        <Loader2
                          className="size-3.5 shrink-0 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {draftFile.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-[var(--muted-foreground)]"
                      disabled={previewLoading}
                      onClick={() => {
                        void handleFileChange(null);
                      }}
                    >
                      <X className="size-3.5" />
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>

            {draftFile && (
              <div className="grid gap-2">
                <Label htmlFor="improve-ai-deviation">
                  Deviation number (optional)
                </Label>
                <div className="relative">
                  <Input
                    id="improve-ai-deviation"
                    value={deviationNo}
                    disabled={isBusy}
                    className={previewLoading ? "pr-9" : undefined}
                    placeholder="Leave blank to use value from file"
                    onChange={(e) => setDeviationNo(e.target.value)}
                  />
                  {previewLoading && (
                    <Loader2
                      className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
                {previewLoading && (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Reading deviation number from Word file…
                  </p>
                )}
              </div>
            )}

            {draftFile && (
              <div className="grid gap-2">
                <Label>Reviewer managers (optional)</Label>
                <ManagerSelector
                  managers={managers}
                  selectedIds={managerIds}
                  onSelectedIdsChange={setManagerIds}
                  disabled={isBusy}
                  emptyMessage="No managers are available to assign."
                />
              </div>
            )}

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
              {submitLabel}
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
