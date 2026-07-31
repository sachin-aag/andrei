"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { AttachmentProcessingStatus } from "@/db/schema";
import { uploadPdfResumable } from "@/lib/attachments/upload-client";
import type { ReportAttachmentRecord } from "@/types/report";

type UploadProgress = {
  filename: string;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
};

type ActiveAttachment = {
  id: string;
  page: number;
};

type ReportAttachmentsContextValue = {
  reportId: string;
  attachments: ReportAttachmentRecord[];
  uploadProgress: Record<string, UploadProgress>;
  canMutateAttachments: boolean;
  activeAttachmentId: string | null;
  activeAttachment: ReportAttachmentRecord | null;
  activePage: number;
  openDocument: (id: string, page?: number) => void;
  closeDocument: () => void;
  uploadFiles: (files: FileList) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  retryAttachment: (id: string) => Promise<void>;
};

const ReportAttachmentsContext =
  createContext<ReportAttachmentsContextValue | null>(null);

const NON_TERMINAL_STATUSES = new Set<AttachmentProcessingStatus>([
  "uploading",
  "validating",
  "queued",
  "processing",
]);

export function ReportAttachmentsProvider({
  reportId,
  initialAttachments,
  canMutateAttachments,
  children,
}: {
  reportId: string;
  initialAttachments: ReportAttachmentRecord[];
  canMutateAttachments: boolean;
  children: ReactNode;
}) {
  const [attachments, setAttachments] =
    useState<ReportAttachmentRecord[]>(initialAttachments);
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, UploadProgress>
  >({});
  const [activeAttachment, setActiveAttachment] =
    useState<ActiveAttachment | null>(null);

  const upsertAttachment = useCallback((attachment: ReportAttachmentRecord) => {
    setAttachments((prev) => {
      const existing = prev.findIndex((item) => item.id === attachment.id);
      if (existing === -1) return [attachment, ...prev];
      const next = [...prev];
      next[existing] = attachment;
      return next;
    });
  }, []);

  const refreshAttachments = useCallback(async () => {
    const response = await fetch(`/api/reports/${reportId}/attachments`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      attachments?: ReportAttachmentRecord[];
    };
    if (Array.isArray(data.attachments)) {
      setAttachments(data.attachments);
    }
  }, [reportId]);

  useEffect(() => {
    if (!attachments.some((item) => NON_TERMINAL_STATUSES.has(item.processingStatus))) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshAttachments();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [attachments, refreshAttachments]);

  const openDocument = useCallback((id: string, page = 1) => {
    setActiveAttachment({ id, page: Math.max(1, page) });
  }, []);

  const closeDocument = useCallback(() => {
    setActiveAttachment(null);
  }, []);

  const uploadOneFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${file.name} is not a PDF file.`);
        return;
      }

      const reservationResponse = await fetch(
        `/api/reports/${reportId}/attachments/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        }
      );
      const reservation = (await reservationResponse.json().catch(() => ({}))) as {
        attachmentId?: string;
        uploadUrl?: string;
        error?: string;
      };
      if (!reservationResponse.ok || !reservation.attachmentId || !reservation.uploadUrl) {
        throw new Error(reservation.error ?? `Could not start upload for ${file.name}`);
      }

      const now = new Date().toISOString();
      upsertAttachment({
        id: reservation.attachmentId,
        reportId,
        filename: file.name,
        mimeType: "application/pdf",
        sizeBytes: file.size,
        pageCount: null,
        processingStatus: "uploading",
        processingProgress: 0,
        processingError: null,
        uploadedAt: now,
        deletedAt: null,
      });

      setUploadProgress((prev) => ({
        ...prev,
        [reservation.attachmentId!]: {
          filename: file.name,
          uploadedBytes: 0,
          totalBytes: file.size,
          percent: 0,
        },
      }));

      try {
        await uploadPdfResumable({
          uploadUrl: reservation.uploadUrl,
          file,
          onProgress: ({ uploadedBytes, totalBytes }) => {
            const percent =
              totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
            setUploadProgress((prev) => ({
              ...prev,
              [reservation.attachmentId!]: {
                filename: file.name,
                uploadedBytes,
                totalBytes,
                percent,
              },
            }));
            setAttachments((prev) =>
              prev.map((item) =>
                item.id === reservation.attachmentId
                  ? { ...item, processingProgress: percent }
                  : item
              )
            );
          },
        });

        const finalizeResponse = await fetch(
          `/api/reports/${reportId}/attachments/${reservation.attachmentId}/finalize`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
        );
        const finalized = (await finalizeResponse.json().catch(() => ({}))) as {
          attachment?: ReportAttachmentRecord;
          error?: string;
        };
        if (!finalizeResponse.ok || !finalized.attachment) {
          throw new Error(finalized.error ?? `Could not finalize ${file.name}`);
        }
        upsertAttachment(finalized.attachment);
        toast.success(`${file.name} uploaded`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Could not upload ${file.name}`;
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === reservation.attachmentId
              ? {
                  ...item,
                  processingStatus: "failed",
                  processingProgress: 0,
                  processingError: message,
                }
              : item
          )
        );
        toast.error(message);
      } finally {
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[reservation.attachmentId!];
          return next;
        });
        void refreshAttachments();
      }
    },
    [refreshAttachments, reportId, upsertAttachment]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (!canMutateAttachments) {
        toast.error("You cannot upload attachments for this report.");
        return;
      }
      await Promise.all(Array.from(files).map((file) => uploadOneFile(file)));
    },
    [canMutateAttachments, uploadOneFile]
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      if (!canMutateAttachments) {
        toast.error("You cannot remove attachments for this report.");
        return;
      }
      const response = await fetch(`/api/reports/${reportId}/attachments/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove attachment");
        return;
      }
      setAttachments((prev) => prev.filter((item) => item.id !== id));
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActiveAttachment((prev) => (prev?.id === id ? null : prev));
      toast.success("Attachment removed");
    },
    [canMutateAttachments, reportId]
  );

  const retryAttachment = useCallback(
    async (id: string) => {
      if (!canMutateAttachments) {
        toast.error("You cannot reprocess attachments for this report.");
        return;
      }
      const response = await fetch(
        `/api/reports/${reportId}/attachments/${id}/reprocess`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        attachment?: ReportAttachmentRecord;
        error?: string;
      };
      if (!response.ok || !data.attachment) {
        toast.error(data.error ?? "Could not reprocess attachment");
        return;
      }
      upsertAttachment(data.attachment);
      toast.success("Attachment queued for reprocessing");
    },
    [canMutateAttachments, reportId, upsertAttachment]
  );

  const activeAttachmentRecord = activeAttachment
    ? attachments.find((item) => item.id === activeAttachment.id) ?? null
    : null;

  const value = useMemo<ReportAttachmentsContextValue>(
    () => ({
      reportId,
      attachments,
      uploadProgress,
      canMutateAttachments,
      activeAttachmentId: activeAttachment?.id ?? null,
      activeAttachment: activeAttachmentRecord,
      activePage: activeAttachment?.page ?? 1,
      openDocument,
      closeDocument,
      uploadFiles,
      removeAttachment,
      retryAttachment,
    }),
    [
      reportId,
      attachments,
      uploadProgress,
      canMutateAttachments,
      activeAttachment,
      activeAttachmentRecord,
      openDocument,
      closeDocument,
      uploadFiles,
      removeAttachment,
      retryAttachment,
    ]
  );

  return (
    <ReportAttachmentsContext.Provider value={value}>
      {children}
    </ReportAttachmentsContext.Provider>
  );
}

export function useReportAttachments() {
  const context = useContext(ReportAttachmentsContext);
  if (!context) {
    throw new Error(
      "useReportAttachments must be used within ReportAttachmentsProvider"
    );
  }
  return context;
}
