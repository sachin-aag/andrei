"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AttachmentQuotaDialog } from "@/components/report/documents/attachment-quota-dialog";
import type { AttachmentProcessingStatus } from "@/db/schema";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
  formatAttachmentCountLimitMessage,
  formatAttachmentWouldExceedMessage,
  isAttachmentCountLimitError,
  isAttachmentQuotaError,
} from "@/lib/attachments/quota-messages";
import { uploadPdfResumable } from "@/lib/attachments/upload-client";
import {
  attachmentUploadMime,
  finalizeAttachmentUpload,
  isSupportedAttachmentFile,
  reserveAttachmentUpload,
} from "@/lib/attachments/upload-pdf";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

type UploadProgress = {
  filename: string;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  /** Epoch ms of the most recent byte advance; drives the slow-connection notice. */
  lastAdvanceAt: number;
  /** Smoothed rate over recent chunks; null until two samples have landed. */
  bytesPerSecond: number | null;
};

/** Rate samples kept per upload. Adaptive chunks are 8–32 MB, so a single delta is jumpy. */
const RATE_SAMPLE_WINDOW = 6;

type RateSample = { at: number; bytes: number };

function rateFromSamples(samples: readonly RateSample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMs = last.at - first.at;
  const deltaBytes = last.bytes - first.bytes;
  if (elapsedMs <= 0 || deltaBytes <= 0) return null;
  return (deltaBytes / elapsedMs) * 1000;
}

type ActiveAttachment = {
  id: string;
  page: number;
};

/** Null folder id means the top level of the report's document tree. */
export type FolderId = string | null;

type ReportAttachmentsContextValue = {
  reportId: string;
  attachments: ReportAttachmentRecord[];
  folders: ReportAttachmentFolderRecord[];
  uploadProgress: Record<string, UploadProgress>;
  canMutateAttachments: boolean;
  activeAttachmentId: string | null;
  activeAttachment: ReportAttachmentRecord | null;
  activePage: number;
  openDocument: (id: string, page?: number) => void;
  closeDocument: () => void;
  documentOpenEpoch: number;
  uploadFiles: (files: FileList, folderId?: FolderId) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  retryAttachment: (id: string) => Promise<void>;
  moveAttachment: (id: string, folderId: FolderId) => Promise<void>;
  renameAttachment: (id: string, filename: string) => Promise<void>;
  updateAttachmentDescription: (
    id: string,
    description: string | null
  ) => Promise<void>;
  createFolder: (name: string, parentId: FolderId) => Promise<string | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId: FolderId) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
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
  initialFolders,
  canMutateAttachments,
  children,
}: {
  reportId: string;
  initialAttachments: ReportAttachmentRecord[];
  initialFolders: ReportAttachmentFolderRecord[];
  canMutateAttachments: boolean;
  children: ReactNode;
}) {
  const [attachments, setAttachments] =
    useState<ReportAttachmentRecord[]>(initialAttachments);
  const [folders, setFolders] =
    useState<ReportAttachmentFolderRecord[]>(initialFolders);
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, UploadProgress>
  >({});
  const [activeAttachment, setActiveAttachment] =
    useState<ActiveAttachment | null>(null);
  const [documentOpenEpoch, setDocumentOpenEpoch] = useState(0);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const quotaWarningShownRef = useRef(false);
  const rateSamplesRef = useRef(new Map<string, RateSample[]>());

  const showQuotaWarning = useCallback((message: string) => {
    // Parallel uploads can all hit the same quota; keep a single modal.
    if (quotaWarningShownRef.current) return;
    quotaWarningShownRef.current = true;
    const max = getAttachmentLimits().maxAttachmentsPerReport;
    setQuotaWarning(
      isAttachmentCountLimitError(message)
        ? formatAttachmentCountLimitMessage(max)
        : message
    );
  }, []);

  const dismissQuotaWarning = useCallback(() => {
    quotaWarningShownRef.current = false;
    setQuotaWarning(null);
  }, []);

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
    setDocumentOpenEpoch((epoch) => epoch + 1);
  }, []);

  const closeDocument = useCallback(() => {
    setActiveAttachment(null);
  }, []);

  const uploadOneFile = useCallback(
    async (file: File, folderId: FolderId) => {
      if (!isSupportedAttachmentFile(file)) {
        toast.error(`${file.name} is not a PDF or Word (.docx) file.`);
        return;
      }

      let attachmentId: string;
      let uploadUrl: string;
      try {
        ({ attachmentId, uploadUrl } = await reserveAttachmentUpload({
          reportId,
          file,
          folderId,
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Could not start upload for ${file.name}`;
        if (isAttachmentQuotaError(message)) {
          showQuotaWarning(message);
        } else {
          toast.error(message);
        }
        return;
      }

      upsertAttachment({
        id: attachmentId,
        reportId,
        folderId,
        filename: file.name,
        description: null,
        mimeType: attachmentUploadMime(file),
        sizeBytes: file.size,
        pageCount: null,
        processingStatus: "uploading",
        processingProgress: 0,
        processingPage: null,
        processingError: null,
        uploadedAt: new Date().toISOString(),
        deletedAt: null,
      });

      rateSamplesRef.current.set(attachmentId, [
        { at: Date.now(), bytes: 0 },
      ]);
      setUploadProgress((prev) => ({
        ...prev,
        [attachmentId]: {
          filename: file.name,
          uploadedBytes: 0,
          totalBytes: file.size,
          percent: 0,
          lastAdvanceAt: Date.now(),
          bytesPerSecond: null,
        },
      }));

      try {
        await uploadPdfResumable({
          uploadUrl,
          file,
          contentType: attachmentUploadMime(file),
          onProgress: ({ uploadedBytes, totalBytes }) => {
            const percent =
              totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
            const at = Date.now();
            const samples = [
              ...(rateSamplesRef.current.get(attachmentId) ?? []),
              { at, bytes: uploadedBytes },
            ].slice(-RATE_SAMPLE_WINDOW);
            rateSamplesRef.current.set(attachmentId, samples);

            setUploadProgress((prev) => ({
              ...prev,
              [attachmentId]: {
                filename: file.name,
                uploadedBytes,
                totalBytes,
                percent,
                lastAdvanceAt: at,
                bytesPerSecond: rateFromSamples(samples),
              },
            }));
            setAttachments((prev) =>
              prev.map((item) =>
                item.id === attachmentId
                  ? { ...item, processingProgress: percent }
                  : item
              )
            );
          },
        });

        upsertAttachment(
          await finalizeAttachmentUpload({
            reportId,
            attachmentId,
            filename: file.name,
          })
        );
        toast.success(`${file.name} uploaded`);
        void refreshAttachments();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Could not upload ${file.name}`;
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === attachmentId
              ? {
                  ...item,
                  processingStatus: "failed",
                  processingProgress: 0,
                  processingError: message,
                }
              : item
          )
        );
        // Persist failure so polling/refresh cannot flip the row back to "uploading".
        await fetch(`/api/reports/${reportId}/attachments/${attachmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadFailed: true, error: message }),
        }).catch(() => undefined);
        if (isAttachmentQuotaError(message)) {
          showQuotaWarning(message);
        } else {
          toast.error(message);
        }
      } finally {
        rateSamplesRef.current.delete(attachmentId);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[attachmentId];
          return next;
        });
      }
    },
    [refreshAttachments, reportId, showQuotaWarning, upsertAttachment]
  );

  const uploadFiles = useCallback(
    async (files: FileList, folderId: FolderId = null) => {
      if (!canMutateAttachments) {
        toast.error("You cannot upload attachments for this report.");
        return;
      }

      const selected = Array.from(files);
      const supportedFiles = selected.filter(isSupportedAttachmentFile);
      for (const file of selected) {
        if (!isSupportedAttachmentFile(file)) {
          toast.error(`${file.name} is not a PDF or Word (.docx) file.`);
        }
      }
      if (supportedFiles.length === 0) return;

      const max = getAttachmentLimits().maxAttachmentsPerReport;
      const remaining = max - attachments.length;
      if (supportedFiles.length > remaining) {
        showQuotaWarning(
          formatAttachmentWouldExceedMessage({
            max,
            remaining: Math.max(0, remaining),
            attempted: supportedFiles.length,
          })
        );
        return;
      }

      quotaWarningShownRef.current = false;
      await Promise.all(
        supportedFiles.map((file) => uploadOneFile(file, folderId))
      );
    },
    [
      attachments.length,
      canMutateAttachments,
      showQuotaWarning,
      uploadOneFile,
    ]
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
      rateSamplesRef.current.delete(id);
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

  const moveAttachment = useCallback(
    async (id: string, folderId: FolderId) => {
      if (!canMutateAttachments) return;

      const previous = attachments.find((item) => item.id === id)?.folderId ?? null;
      if (previous === folderId) return;

      setAttachments((prev) =>
        prev.map((item) => (item.id === id ? { ...item, folderId } : item))
      );

      const response = await fetch(`/api/reports/${reportId}/attachments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, folderId: previous } : item
          )
        );
        toast.error(data.error ?? "Could not move document");
      }
    },
    [attachments, canMutateAttachments, reportId]
  );

  const patchAttachmentMeta = useCallback(
    async (
      id: string,
      body: { filename?: string; description?: string | null },
      errorMessage: string
    ) => {
      if (!canMutateAttachments) return;

      const previous = attachments.find((item) => item.id === id);
      if (!previous) return;

      const nextFilename = body.filename ?? previous.filename;
      const nextDescription =
        body.description !== undefined ? body.description : previous.description;

      if (
        nextFilename === previous.filename &&
        nextDescription === previous.description
      ) {
        return;
      }

      setAttachments((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                filename: nextFilename,
                description: nextDescription,
              }
            : item
        )
      );

      const response = await fetch(`/api/reports/${reportId}/attachments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        attachment?: ReportAttachmentRecord;
        error?: string;
      };
      if (!response.ok) {
        setAttachments((prev) =>
          prev.map((item) => (item.id === id ? previous : item))
        );
        toast.error(data.error ?? errorMessage);
        return;
      }
      if (data.attachment) {
        upsertAttachment(data.attachment);
      }
    },
    [attachments, canMutateAttachments, reportId, upsertAttachment]
  );

  const renameAttachment = useCallback(
    async (id: string, filename: string) => {
      await patchAttachmentMeta(id, { filename }, "Could not rename document");
    },
    [patchAttachmentMeta]
  );

  const updateAttachmentDescription = useCallback(
    async (id: string, description: string | null) => {
      await patchAttachmentMeta(
        id,
        { description },
        "Could not update description"
      );
    },
    [patchAttachmentMeta]
  );

  const createFolder = useCallback(
    async (name: string, parentId: FolderId) => {
      if (!canMutateAttachments) return null;

      const response = await fetch(`/api/reports/${reportId}/attachment-folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        folder?: ReportAttachmentFolderRecord;
        error?: string;
      };
      if (!response.ok || !data.folder) {
        toast.error(data.error ?? "Could not create folder");
        return null;
      }
      const created = data.folder;
      setFolders((prev) => [...prev, created]);
      return created.id;
    },
    [canMutateAttachments, reportId]
  );

  const patchFolder = useCallback(
    async (id: string, body: { name?: string; parentId?: FolderId }) => {
      if (!canMutateAttachments) return;

      const previous = folders.find((item) => item.id === id);
      if (!previous) return;

      setFolders((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                name: body.name ?? item.name,
                parentId: body.parentId !== undefined ? body.parentId : item.parentId,
              }
            : item
        )
      );

      const response = await fetch(
        `/api/reports/${reportId}/attachment-folders/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setFolders((prev) =>
          prev.map((item) => (item.id === id ? previous : item))
        );
        toast.error(data.error ?? "Could not update folder");
      }
    },
    [canMutateAttachments, folders, reportId]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await patchFolder(id, { name });
    },
    [patchFolder]
  );

  const moveFolder = useCallback(
    async (id: string, parentId: FolderId) => {
      if (id === parentId) return;
      await patchFolder(id, { parentId });
    },
    [patchFolder]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!canMutateAttachments) return;

      const response = await fetch(
        `/api/reports/${reportId}/attachment-folders/${id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Could not delete folder");
        return;
      }

      // The server reparents children to the deleted folder's parent.
      const removed = folders.find((item) => item.id === id);
      const parentId = removed?.parentId ?? null;
      setFolders((prev) =>
        prev
          .filter((item) => item.id !== id)
          .map((item) => (item.parentId === id ? { ...item, parentId } : item))
      );
      setAttachments((prev) =>
        prev.map((item) => (item.folderId === id ? { ...item, folderId: parentId } : item))
      );
    },
    [canMutateAttachments, folders, reportId]
  );

  const activeAttachmentRecord = activeAttachment
    ? attachments.find((item) => item.id === activeAttachment.id) ?? null
    : null;

  const value = useMemo<ReportAttachmentsContextValue>(
    () => ({
      reportId,
      attachments,
      folders,
      uploadProgress,
      canMutateAttachments,
      activeAttachmentId: activeAttachment?.id ?? null,
      activeAttachment: activeAttachmentRecord,
      activePage: activeAttachment?.page ?? 1,
      openDocument,
      closeDocument,
      documentOpenEpoch,
      uploadFiles,
      removeAttachment,
      retryAttachment,
      moveAttachment,
      renameAttachment,
      updateAttachmentDescription,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
    }),
    [
      reportId,
      attachments,
      folders,
      uploadProgress,
      canMutateAttachments,
      activeAttachment,
      activeAttachmentRecord,
      openDocument,
      closeDocument,
      documentOpenEpoch,
      uploadFiles,
      removeAttachment,
      retryAttachment,
      moveAttachment,
      renameAttachment,
      updateAttachmentDescription,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
    ]
  );

  return (
    <ReportAttachmentsContext.Provider value={value}>
      {children}
      <AttachmentQuotaDialog
        message={quotaWarning}
        onDismiss={dismissQuotaWarning}
      />
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
