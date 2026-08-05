"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  FolderPlus,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildDocumentTree } from "@/lib/attachments/build-tree";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import { DocumentTreeNodes } from "./document-tree";
import { DragProvider, useDocumentDrag } from "./drag-context";
import { NewFolderRow } from "./new-folder-row";

/**
 * Report-scoped file browser. Lives to the left of the document canvas so the
 * evidence tree stays visible while editing, unlike the old right-sidebar tab.
 */
export function DocumentsPanel({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { attachments } = useReportAttachments();

  if (collapsed) {
    return (
      <aside
        aria-label="Documents"
        className="relative flex w-12 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--card)] py-2"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand documents"
          aria-expanded={false}
          title="Documents"
          className="relative flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          <Paperclip className="size-4" aria-hidden="true" />
          {attachments.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
              {attachments.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand documents panel"
          className="mt-1 flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          title="Expand"
        >
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <DragProvider>
      <ExpandedDocumentsPanel onToggleCollapse={onToggleCollapse} />
    </DragProvider>
  );
}

function ExpandedDocumentsPanel({
  onToggleCollapse,
}: {
  onToggleCollapse: () => void;
}) {
  const { attachments, folders, canMutateAttachments, uploadFiles } =
    useReportAttachments();
  const { dragging, endDrag } = useDocumentDrag();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [rootDropActive, setRootDropActive] = useState(false);

  const tree = useMemo(
    () => buildDocumentTree(folders, attachments),
    [folders, attachments]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setIsUploading(true);
      try {
        await uploadFiles(files, null);
      } finally {
        setIsUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [uploadFiles]
  );

  const isEmpty = tree.folders.length === 0 && tree.attachments.length === 0;

  return (
    <aside
      aria-label="Documents"
      className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]"
    >
      <div className="flex items-center justify-between gap-1 border-b border-[var(--border)] px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Paperclip className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          Documents
        </h2>
        <div className="flex items-center gap-0.5">
          {canMutateAttachments ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="New folder"
                title="New folder"
                onClick={() => setCreatingFolder(true)}
              >
                <FolderPlus className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Upload PDF"
                title="Upload PDF"
                disabled={isUploading}
                onClick={() => inputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => void handleFiles(event.target.files)}
              />
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Collapse documents panel"
            aria-expanded
            title="Collapse"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-2",
          rootDropActive && "bg-[var(--secondary)]/60"
        )}
        onDragOver={(event) => {
          if (!canMutateAttachments) return;
          event.preventDefault();
          setRootDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setRootDropActive(false);
        }}
        onDrop={(event) => {
          if (!canMutateAttachments) return;
          event.preventDefault();
          setRootDropActive(false);
          if (event.dataTransfer.files.length > 0) {
            void handleFiles(event.dataTransfer.files);
            return;
          }
          void endDrag(null);
        }}
      >
        {creatingFolder ? (
          <NewFolderRow
            parentId={null}
            depth={0}
            onDone={() => setCreatingFolder(false)}
          />
        ) : null}

        <DocumentTreeNodes
          folders={tree.folders}
          attachments={tree.attachments}
          depth={0}
        />

        {isEmpty && !creatingFolder ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--muted-foreground)]">
            {canMutateAttachments
              ? "Drop PDFs here or use the upload button."
              : "No documents have been attached yet."}
          </p>
        ) : null}
      </div>

      {dragging ? (
        <p className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          Drop on a folder to move, or here for the top level.
        </p>
      ) : null}
    </aside>
  );
}
