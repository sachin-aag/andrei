"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Plus, X } from "lucide-react";
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
import type { DocumentType } from "@/db/schema";
import { getCustomerPack } from "@/lib/customers/packs";
import { listDocumentTypes } from "@/lib/document-types";

type CreateReportButtonProps = {
  managers: Pick<WorkspaceUser, "id" | "name" | "title">[];
};

export function CreateReportButton({ managers }: CreateReportButtonProps) {
  const availableTypes = listDocumentTypes();
  const wordImportEnabled = getCustomerPack().wordImportEnabled;
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>(
    () => availableTypes[0]?.key ?? "investigation_report"
  );
  const [documentNo, setDocumentNo] = useState("");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const docxInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const showWordImport =
    wordImportEnabled && documentType === "investigation_report";
  const busy = pending || previewLoading;
  const selectedType =
    availableTypes.find((type) => type.key === documentType) ?? availableTypes[0];
  const documentNoLabel = selectedType?.documentNoLabel ?? "Deviation Number";
  const dialogTitle = selectedType
    ? `Create ${selectedType.label.toLowerCase()}`
    : "Create investigation report";
  const dialogDescription = showWordImport
    ? "Starts a new deviation investigation report as a draft. Optionally upload an existing Word document to fill Define through Control."
    : selectedType
      ? `Starts a new ${selectedType.label.toLowerCase()} as a draft.`
      : "Starts a new deviation investigation report as a draft.";

  const resetForm = () => {
    setDocumentType(availableTypes[0]?.key ?? "investigation_report");
    setDocumentNo("");
    setManagerIds([]);
    setDraftFile(null);
    setPreviewLoading(false);
    if (docxInputRef.current) docxInputRef.current.value = "";
  };

  const clearDraftFile = () => {
    setDraftFile(null);
    setPreviewLoading(false);
    if (docxInputRef.current) docxInputRef.current.value = "";
  };

  const handleDocumentTypeChange = (next: DocumentType) => {
    setDocumentType(next);
    if (next !== "investigation_report") clearDraftFile();
  };

  const handleDraftFileChange = async (file: File | null) => {
    setDraftFile(file);
    if (!file) {
      clearDraftFile();
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
      const data = (await res.json()) as {
        deviationNo?: string | null;
        documentNo?: string | null;
      };
      const extracted = data.documentNo ?? data.deviationNo;
      if (extracted) setDocumentNo(extracted);
    } catch {
      toast.error("Could not read that Word file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const submit = () => {
    if (!documentNo.trim()) {
      toast.error(`${documentNoLabel} is required`);
      return;
    }
    startTransition(async () => {
      const importedFile = draftFile;
      const useMultipart = showWordImport && importedFile !== null;
      const res = useMultipart
        ? await fetch("/api/reports", {
            method: "POST",
            body: (() => {
              const fd = new FormData();
              fd.append("documentType", documentType);
              fd.append("documentNo", documentNo.trim());
              for (const managerId of managerIds) {
                fd.append("assignedManagerIds", managerId);
              }
              fd.append("file", importedFile);
              return fd;
            })(),
          })
        : await fetch("/api/reports", {
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
        fromDocx: useMultipart,
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
              <p className="text-sm text-[var(--muted-foreground)]">
                Creating report…
              </p>
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
                    handleDocumentTypeChange(e.target.value as DocumentType)
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
              <div className="relative">
                <Input
                  id="documentNo"
                  placeholder={
                    documentType === "design_verification"
                      ? "e.g. DVR-2026-001"
                      : "e.g. DEV/PK/26/001"
                  }
                  value={documentNo}
                  disabled={busy}
                  className={previewLoading ? "pr-9" : undefined}
                  onChange={(e) => setDocumentNo(e.target.value)}
                />
                {previewLoading ? (
                  <Loader2
                    className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              {previewLoading ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Reading deviation number from Word file…
                </p>
              ) : null}
            </div>
            {showWordImport ? (
              <div className="grid gap-2">
                <Label htmlFor="report-upload">Existing report (.docx, optional)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="report-upload"
                    ref={docxInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="cursor-pointer file:mr-3 file:inline-flex file:items-center file:justify-start file:rounded-md file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1 file:text-left file:text-sm"
                    disabled={busy}
                    onChange={(e) => {
                      void handleDraftFileChange(e.target.files?.[0] ?? null);
                    }}
                  />
                  {draftFile ? (
                    <>
                      <span className="flex max-w-[200px] items-center gap-1.5 truncate text-xs text-[var(--muted-foreground)]">
                        {previewLoading ? (
                          <Loader2
                            className="size-3.5 shrink-0 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileText
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
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
                          void handleDraftFileChange(null);
                        }}
                      >
                        <X className="size-3.5" />
                        Clear
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
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
  );
}
