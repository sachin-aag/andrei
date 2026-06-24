"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus, Loader2, X } from "lucide-react";
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
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = previewLoading || pending;

  const resetForm = () => {
    setDeviationNo("");
    setManagerIds([]);
    setDraftFile(null);
    setPreviewLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isBusy) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const handleFileChange = async (file: File | null) => {
    setDraftFile(file);
    if (!file) {
      setPreviewLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        toast.error(body.error ?? "Could not read that Word file");
        return;
      }
      const data = (await res.json()) as { deviationNo?: string | null };
      if (data.deviationNo) {
        setDeviationNo(data.deviationNo);
      }
    } catch {
      toast.error("Could not read that Word file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const createReport = (destination: "edit" | "guided") => {
    if (!deviationNo.trim()) {
      toast.error("Deviation number is required");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("deviationNo", deviationNo.trim());
      for (const managerId of managerIds) {
        fd.append("assignedManagerIds", managerId);
      }
      if (draftFile) fd.append("file", draftFile);

      const res = await fetch("/api/reports", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to create report");
        return;
      }
      const data = (await res.json()) as { id: string };
      captureEvent("report_created", {
        reportId: data.id,
        fromDocx: !!draftFile,
      });
      setOpen(false);
      resetForm();
      if (destination === "guided") {
        router.push(`/reports/${data.id}/guided`);
      } else {
        toast.success("Report created");
        router.push(`/reports/${data.id}/edit`);
      }
      router.refresh();
    });
  };

  const submit = () => createReport("edit");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Report
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
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
              Starts a new deviation investigation report as a draft. Optionally
              upload an existing Word document (.docx): content under headings named
              Define, Measure, Analyze, Improve, and Control is placed into those
              sections. If those headings are missing, the whole document opens in
              Define.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="report-upload">Existing report (.docx, optional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="report-upload"
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="cursor-pointer file:mr-3 file:inline-flex file:items-center file:justify-start file:rounded-md file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1 file:text-left file:text-sm"
                disabled={isBusy}
                onChange={(e) => {
                  void handleFileChange(e.target.files?.[0] ?? null);
                }}
              />
              {draftFile && (
                <>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] max-w-[200px] truncate">
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
          <div className="grid gap-2">
            <Label htmlFor="deviationNo">Deviation Number</Label>
            <div className="relative">
              <Input
                id="deviationNo"
                placeholder="e.g. DEV/PK/26/001"
                value={deviationNo}
                disabled={previewLoading || pending}
                className={previewLoading ? "pr-9" : undefined}
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
        </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isBusy}
              className="sm:mr-auto"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => createReport("guided")}
              disabled={isBusy}
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {pending ? "Creating…" : "Start with Guided Flow"}
            </Button>
            <Button onClick={submit} disabled={isBusy}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {pending ? "Creating…" : "Create Empty"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
