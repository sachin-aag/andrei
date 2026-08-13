"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AttachmentQuotaDialog } from "@/components/report/documents/attachment-quota-dialog";
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
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
  formatAttachmentWouldExceedMessage,
  isAttachmentQuotaError,
} from "@/lib/attachments/quota-messages";
import { ATTACHMENT_ACCEPT_ATTR } from "@/lib/attachments/file-types";
import {
  isSupportedAttachmentFile,
  uploadPdfToReport,
} from "@/lib/attachments/upload-pdf";
import { ManagerSelector } from "@/components/report/manager-selector";
import type { DocumentType } from "@/db/schema";
import { listDocumentTypes } from "@/lib/document-types";

type CreateReportButtonProps = {
  managers: Pick<WorkspaceUser, "id" | "name" | "title">[];
};

/** Uploads are report-scoped, so queued files go up after the report exists. */
type PendingUpload = { file: File; percent: number };

export function CreateReportButton({ managers }: CreateReportButtonProps) {
  const availableTypes = listDocumentTypes();
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>(
    () => availableTypes[0]?.key ?? "investigation_report"
  );
  const [documentNo, setDocumentNo] = useState("");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const busy = pending || uploadingCount > 0;
  const selectedType =
    availableTypes.find((type) => type.key === documentType) ?? availableTypes[0];
  const documentNoLabel = selectedType?.documentNoLabel ?? "Deviation Number";
  const dialogTitle = selectedType
    ? `Create ${selectedType.label.toLowerCase()}`
    : "Create investigation report";
  const dialogDescription = selectedType
    ? `Starts a new ${selectedType.label.toLowerCase()} as a draft.`
    : "Starts a new deviation investigation report as a draft.";

  const resetForm = () => {
    setDocumentType(availableTypes[0]?.key ?? "investigation_report");
    setDocumentNo("");
    setManagerIds([]);
    setUploads([]);
    setQuotaWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: PendingUpload[] = [];
    for (const file of Array.from(files)) {
      if (!isSupportedAttachmentFile(file)) {
        toast.error(`${file.name} is not a PDF or Word (.docx) file.`);
        continue;
      }
      accepted.push({ file, percent: 0 });
    }
    if (accepted.length === 0) return;

    const max = getAttachmentLimits().maxAttachmentsPerReport;
    const unique = accepted.filter(
      (candidate) =>
        !uploads.some(
          (existing) =>
            existing.file.name === candidate.file.name &&
            existing.file.size === candidate.file.size
        )
    );
    if (unique.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (uploads.length + unique.length > max) {
      setQuotaWarning(
        formatAttachmentWouldExceedMessage({
          max,
          remaining: Math.max(0, max - uploads.length),
          attempted: unique.length,
        })
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploads((prev) => [...prev, ...unique]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (name: string) => {
    setUploads((prev) => prev.filter((upload) => upload.file.name !== name));
  };

  const uploadQueuedFiles = async (reportId: string) => {
    if (uploads.length === 0) return;
    setUploadingCount(uploads.length);
    const results = await Promise.allSettled(
      uploads.map((upload) =>
        uploadPdfToReport({
          reportId,
          file: upload.file,
          onProgress: ({ percent }) => {
            setUploads((prev) =>
              prev.map((item) =>
                item.file.name === upload.file.name ? { ...item, percent } : item
              )
            );
          },
        })
      )
    );
    setUploadingCount(0);

    const quotaRejection = results.find(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof Error &&
        isAttachmentQuotaError(result.reason.message)
    );
    if (quotaRejection && quotaRejection.status === "rejected") {
      const reason = quotaRejection.reason;
      setQuotaWarning(
        reason instanceof Error
          ? reason.message
          : formatAttachmentWouldExceedMessage({
              max: getAttachmentLimits().maxAttachmentsPerReport,
              remaining: 0,
              attempted: uploads.length,
            })
      );
      return;
    }

    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      toast.error(
        `${failed} of ${uploads.length} document${uploads.length === 1 ? "" : "s"} failed to upload. Retry from the report's Documents panel.`
      );
    }
  };

  const submit = () => {
    if (!documentNo.trim()) {
      toast.error(`${documentNoLabel} is required`);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          documentNo: documentNo.trim(),
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
        attachmentCount: uploads.length,
      });
      toast.success("Report created");

      await uploadQueuedFiles(data.id);

      setOpen(false);
      resetForm();
      router.push(`/reports/${data.id}/edit`);
      router.refresh();
    });
  };

  const statusLabel =
    uploadingCount > 0 ? "Uploading documents…" : "Creating report…";

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Report
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="relative min-w-0">
          {busy && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--card)]/85 backdrop-blur-[1px]"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="size-5 animate-spin text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--muted-foreground)]">{statusLabel}</p>
            </div>
          )}
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 py-2">
            {availableTypes.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="documentType">Document type</Label>
              <select
                id="documentType"
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={documentType}
                disabled={busy}
                onChange={(e) =>
                  setDocumentType(e.target.value as DocumentType)
                }
              >
                {availableTypes.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="documentNo">{documentNoLabel}</Label>
              <Input
                id="documentNo"
                placeholder={
                  documentType === "design_verification"
                    ? "e.g. DVR-2026-001"
                    : "e.g. DEV/PK/26/001"
                }
                value={documentNo}
                disabled={busy}
                onChange={(e) => setDocumentNo(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Reviewer managers (optional)</Label>
              <ManagerSelector
                managers={managers}
                selectedIds={managerIds}
                onSelectedIdsChange={setManagerIds}
                disabled={busy}
                emptyMessage="No managers are available to assign."
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>Documents (optional)</Label>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  addFiles(event.dataTransfer.files);
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--brand-600)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="size-4" aria-hidden="true" />
                Drop PDFs or Word docs here or click to browse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT_ATTR}
                multiple
                className="hidden"
                onChange={(event) => addFiles(event.target.files)}
              />
              {uploads.length > 0 ? (
                <ul className="max-h-48 min-w-0 space-y-1 overflow-y-auto overflow-x-hidden">
                  {uploads.map((upload) => (
                    <li
                      key={upload.file.name}
                      className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-[var(--border)] px-2 py-1.5"
                    >
                      <FileText
                        className="size-4 shrink-0 text-[var(--muted-foreground)]"
                        aria-hidden="true"
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]"
                        title={upload.file.name}
                      >
                        {upload.file.name}
                      </span>
                      {uploadingCount > 0 ? (
                        <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                          {upload.percent}%
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Remove ${upload.file.name}`}
                          onClick={() => removeFile(upload.file.name)}
                          className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    <AttachmentQuotaDialog
      message={quotaWarning}
      onDismiss={() => setQuotaWarning(null)}
    />
    </>
  );
}
