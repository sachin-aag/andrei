"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RotateCw,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DocumentTreeFolder } from "@/lib/attachments/build-tree";
import { ATTACHMENT_DESCRIPTION_MAX } from "@/lib/attachments/description";
import { canReprocessAttachment } from "@/lib/attachments/ingest-errors";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import type { AttachmentProcessingStatus } from "@/db/schema";
import type { ReportAttachmentRecord } from "@/types/report";
import { useDocumentDrag } from "./drag-context";
import { indentStyle } from "./indent";
import { NewFolderRow } from "./new-folder-row";

export function DocumentTreeNodes({
  folders,
  attachments,
  depth,
}: {
  folders: DocumentTreeFolder[];
  attachments: ReportAttachmentRecord[];
  depth: number;
}) {
  return (
    <>
      {folders.map((folder) => (
        <FolderNode key={folder.id} folder={folder} depth={depth} />
      ))}
      {attachments.map((attachment) => (
        <FileNode key={attachment.id} attachment={attachment} depth={depth} />
      ))}
    </>
  );
}

function FolderNode({
  folder,
  depth,
}: {
  folder: DocumentTreeFolder;
  depth: number;
}) {
  const { canMutateAttachments, renameFolder, deleteFolder, uploadFiles } =
    useReportAttachments();
  const { beginDrag, cancelDrag, endDrag, canDropOn, dragging } = useDocumentDrag();
  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const [creatingChild, setCreatingChild] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const isDropTarget = dropActive && canDropOn(folder.id);

  const commitRename = async () => {
    const trimmed = draftName.trim();
    setRenaming(false);
    if (!trimmed || trimmed === folder.name) {
      setDraftName(folder.name);
      return;
    }
    await renameFolder(folder.id, trimmed);
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete the folder "${folder.name}"? Its documents move up one level.`
    );
    if (!confirmed) return;
    await deleteFolder(folder.id);
  };

  return (
    <div data-document-folder={folder.id}>
      <div
        draggable={canMutateAttachments && !renaming}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          beginDrag({ kind: "folder", id: folder.id });
        }}
        onDragEnd={cancelDrag}
        onDragOver={(event) => {
          if (!canMutateAttachments) return;
          event.preventDefault();
          event.stopPropagation();
          setDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropActive(false);
        }}
        onDrop={(event) => {
          if (!canMutateAttachments) return;
          event.preventDefault();
          event.stopPropagation();
          setDropActive(false);
          if (event.dataTransfer.files.length > 0) {
            setExpanded(true);
            void uploadFiles(event.dataTransfer.files, folder.id);
            return;
          }
          setExpanded(true);
          void endDrag(folder.id);
        }}
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-1 transition-colors",
          isDropTarget
            ? "bg-[var(--brand-600)]/15 ring-1 ring-[var(--brand-600)]"
            : "hover:bg-[var(--secondary)]/60",
          dragging?.kind === "folder" && dragging.id === folder.id && "opacity-50"
        )}
        style={indentStyle(depth)}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          )}
          {expanded ? (
            <FolderOpen className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          ) : (
            <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          )}
          {renaming ? null : (
            <span className="truncate text-sm text-[var(--foreground)]">
              {folder.name}
            </span>
          )}
        </button>

        {renaming ? (
          <input
            autoFocus
            aria-label={`Rename ${folder.name}`}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") {
                setDraftName(folder.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          />
        ) : null}

        {canMutateAttachments && !renaming ? (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`New folder inside ${folder.name}`}
              title="New subfolder"
              onClick={() => {
                setExpanded(true);
                setCreatingChild(true);
              }}
            >
              <FolderPlus className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Rename ${folder.name}`}
              title="Rename"
              onClick={() => {
                setDraftName(folder.name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
              aria-label={`Delete ${folder.name}`}
              title="Delete folder"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <>
          {creatingChild ? (
            <NewFolderRow
              parentId={folder.id}
              depth={depth + 1}
              onDone={() => setCreatingChild(false)}
            />
          ) : null}
          <DocumentTreeNodes
            folders={folder.folders}
            attachments={folder.attachments}
            depth={depth + 1}
          />
          {folder.folders.length === 0 &&
          folder.attachments.length === 0 &&
          !creatingChild ? (
            <p
              className="py-1 text-xs text-[var(--muted-foreground)]"
              style={indentStyle(depth + 1)}
            >
              Empty
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FileNode({
  attachment,
  depth,
}: {
  attachment: ReportAttachmentRecord;
  depth: number;
}) {
  const {
    canMutateAttachments,
    activeAttachmentId,
    uploadProgress,
    openDocument,
    removeAttachment,
    retryAttachment,
    renameAttachment,
    updateAttachmentDescription,
  } = useReportAttachments();
  const { beginDrag, cancelDrag, dragging } = useDocumentDrag();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(attachment.filename);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const isActive = activeAttachmentId === attachment.id;
  const progress =
    uploadProgress[attachment.id]?.percent ?? attachment.processingProgress;
  const pending = isPendingStatus(attachment.processingStatus);
  const canRetry = canReprocessAttachment(attachment);

  const handleRemove = async () => {
    const confirmed = window.confirm(
      `Remove "${attachment.filename}" from this report?`
    );
    if (!confirmed) return;
    await removeAttachment(attachment.id);
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    setRenaming(false);
    if (!trimmed || trimmed === attachment.filename) {
      setDraftName(attachment.filename);
      return;
    }
    await renameAttachment(attachment.id, trimmed);
  };

  const startRename = () => {
    setDraftName(attachment.filename);
    setRenaming(true);
  };

  const row = (
    <div
      data-document-file={attachment.id}
      data-status={attachment.processingStatus}
      draggable={canMutateAttachments && !renaming}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        beginDrag({ kind: "file", id: attachment.id });
      }}
      onDragEnd={cancelDrag}
      className={cn(
        "group rounded-md py-1 pr-1 transition-colors",
        isActive ? "bg-[var(--secondary)]" : "hover:bg-[var(--secondary)]/60",
        dragging?.kind === "file" && dragging.id === attachment.id && "opacity-50"
      )}
      style={indentStyle(depth)}
    >
      <div className="flex items-center gap-1">
        {renaming ? (
          <>
            <FileText
              className="ml-[18px] size-4 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              autoFocus
              aria-label={`Rename ${attachment.filename}`}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename();
                if (event.key === "Escape") {
                  setDraftName(attachment.filename);
                  setRenaming(false);
                }
              }}
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => openDocument(attachment.id)}
            title={
              attachment.description
                ? `${attachment.filename}\n${attachment.description}`
                : attachment.filename
            }
            className="flex min-w-0 flex-1 items-center gap-1.5 pl-[18px] text-left"
          >
            <FileText
              className={cn(
                "size-4 shrink-0",
                attachment.processingStatus === "failed" ||
                Boolean(attachment.processingError)
                  ? "text-[var(--destructive)]"
                  : "text-[var(--muted-foreground)]"
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm",
                  isActive
                    ? "font-medium text-[var(--foreground)]"
                    : "text-[var(--foreground)]"
                )}
              >
                {attachment.filename}
              </span>
              {attachment.description ? (
                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-[var(--muted-foreground)]">
                  {attachment.description}
                </span>
              ) : null}
            </span>
          </button>
        )}

        {canMutateAttachments && !renaming ? (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {canRetry ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Retry ${attachment.filename}`}
                title="Retry"
                onClick={() => void retryAttachment(attachment.id)}
              >
                <RotateCw className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
              aria-label={`Remove ${attachment.filename}`}
              title="Remove"
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {pending ? (
        <div className="mt-1 flex items-center gap-2 pl-[18px]">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--secondary)]">
            <div
              className="h-full rounded-full bg-[var(--brand-600)] transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {attachment.processingStatus}
          </span>
        </div>
      ) : null}

      {attachment.processingError ? (
        <p className="mt-1 pl-[18px] text-xs text-[var(--destructive)]">
          {attachment.processingError}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {canMutateAttachments && !renaming ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={startRename}>
              <Pencil aria-hidden="true" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setDescriptionOpen(true)}>
              <TextCursorInput aria-hidden="true" />
              {attachment.description ? "Edit description" : "Add description"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => void handleRemove()}>
              <Trash2 aria-hidden="true" />
              Delete file
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}

      {descriptionOpen ? (
        <AttachmentDescriptionDialog
          key={attachment.id}
          filename={attachment.filename}
          initialDescription={attachment.description}
          onClose={() => setDescriptionOpen(false)}
          onSave={async (description) => {
            await updateAttachmentDescription(attachment.id, description);
          }}
        />
      ) : null}
    </>
  );
}

function AttachmentDescriptionDialog({
  filename,
  initialDescription,
  onClose,
  onSave,
}: {
  filename: string;
  initialDescription: string | null;
  onClose: () => void;
  onSave: (description: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = draft.trim();
      await onSave(trimmed.length > 0 ? trimmed : null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Description</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add 2–3 lines of context for{" "}
          <span className="font-medium text-[var(--foreground)]">{filename}</span>.
          This note is shown to the AI when using this document as evidence.
        </p>
        <Textarea
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.slice(0, ATTACHMENT_DESCRIPTION_MAX))
          }
          placeholder="e.g. Batch record for Lot 24A — shows temperature excursion around 14:30 on the day of the deviation."
          rows={3}
          maxLength={ATTACHMENT_DESCRIPTION_MAX}
          className="min-h-[5.5rem] resize-none"
        />
        <p className="text-right text-xs text-[var(--muted-foreground)]">
          {draft.length}/{ATTACHMENT_DESCRIPTION_MAX}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isPendingStatus(status: AttachmentProcessingStatus): boolean {
  return (
    status === "uploading" ||
    status === "validating" ||
    status === "queued" ||
    status === "processing"
  );
}
