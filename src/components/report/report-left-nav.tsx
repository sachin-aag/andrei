"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SECTION_LABELS, REPORT_WORKSPACE_SECTIONS } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import {
  useReportAttachments,
  useReportData,
} from "@/providers/report-provider";
import { pdfUploadError } from "@/lib/attachments/pdf-upload";

type Props = {
  collapsed: boolean;
  backHref: string;
  backLabel: string;
  onJumpToSection: (section: SectionType) => void;
};

export function ReportLeftNav({
  collapsed,
  backHref,
  backLabel,
  onJumpToSection,
}: Props) {
  const { report, readOnly } = useReportData();
  const {
    attachments,
    viewMode,
    activeAttachmentId,
    openAttachment,
    closeAttachment,
    addAttachment,
    removeAttachment,
    canModifyAttachments,
  } = useReportAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();

  const handleUpload = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const err = pdfUploadError(file);
    if (err) {
      toast.error(err);
      return;
    }
    startUpload(async () => {
      try {
        await addAttachment(file);
        toast.success("Attachment uploaded");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Link
          href={backHref}
          title={backLabel}
          aria-label={backLabel}
          className="flex size-10 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <button
          type="button"
          title="Report document"
          aria-label="Report document"
          onClick={closeAttachment}
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            viewMode === "document"
              ? "bg-[var(--brand-700)] text-white"
              : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          )}
        >
          <FileText className="size-4" />
        </button>
        {attachments.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.filename}
            aria-label={a.filename}
            onClick={() => openAttachment(a.id)}
            className={cn(
              "flex size-10 items-center justify-center rounded-md",
              viewMode === "attachment" && activeAttachmentId === a.id
                ? "bg-[var(--brand-700)] text-white"
                : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
            )}
          >
            <Paperclip className="size-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-md hover:bg-[var(--secondary)]"
      >
        <ArrowLeft className="size-4 shrink-0" />
        {backLabel}
      </Link>

      <div className="px-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          Report
        </p>
        <p className="mt-1 text-sm font-semibold truncate" title={report.deviationNo}>
          {report.deviationNo}
        </p>
      </div>

      <div>
        <p className="px-3 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
          Sections
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={closeAttachment}
            className={cn(
              "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
              viewMode === "document"
                ? "bg-[var(--brand-700)] text-white"
                : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
            )}
          >
            Full report
          </button>
          {REPORT_WORKSPACE_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => {
                closeAttachment();
                onJumpToSection(section);
              }}
              className="w-full text-left px-3 py-1.5 text-xs rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {SECTION_LABELS[section]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-3 mb-1">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            PDF attachments
          </p>
          {canModifyAttachments && !readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={uploading}
                aria-label="Add PDF attachment"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
        {attachments.length === 0 ? (
          <p className="px-3 text-xs text-[var(--muted-foreground)]">
            No PDFs attached
          </p>
        ) : (
          <ul className="space-y-0.5">
            {attachments.map((attachment) => {
              const active =
                viewMode === "attachment" &&
                activeAttachmentId === attachment.id;
              return (
                <li key={attachment.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openAttachment(attachment.id)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs rounded-md text-left transition-colors",
                      active
                        ? "bg-[var(--brand-700)] text-white"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                    )}
                  >
                    <Paperclip className="size-3.5 shrink-0" />
                    <span className="truncate">{attachment.filename}</span>
                  </button>
                  {canModifyAttachments && !readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)]"
                      aria-label={`Remove ${attachment.filename}`}
                      disabled={uploading}
                      onClick={() => {
                        startUpload(async () => {
                          try {
                            await removeAttachment(attachment.id);
                            toast.success("Attachment removed");
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Delete failed"
                            );
                          }
                        });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
