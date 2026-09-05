"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AttachmentPreviewPanel } from "@/components/report/attachment-preview-panel";
import { ManagerSelector } from "@/components/report/manager-selector";
import { LibraryAssetLabel } from "@/components/profile/library-asset-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";
import { formatLibraryUploadedAt } from "@/lib/attachments/library-display";
import {
  libraryTargetFolderDepth,
  libraryUploadBatchError,
  libraryUploadFilesFromDataTransfer,
  libraryUploadFilesFromList,
  type LibraryUploadFile,
} from "@/lib/attachments/library-drop-files";
import { uploadFileToLibrary } from "@/lib/attachments/upload-library";
import { ATTACHMENT_ACCEPT_ATTR } from "@/lib/attachments/file-types";
import {
  libraryDownloadHref,
  libraryPreviewSrc,
} from "@/lib/attachments/preview-urls";
import { cn } from "@/lib/utils";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

const LIBRARY_ROOT = "__library_root__";

type Props = {
  currentUser: Pick<WorkspaceUser, "id" | "role">;
  workspaceUsers: WorkspaceUser[];
  hideIntro?: boolean;
};

type LibraryResponse = {
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
  archivedFolders: AttachmentLibraryFolderRecord[];
  archivedAssets: AttachmentLibraryAssetRecord[];
};

const ARCHIVE_FILE_CONFIRM =
  "Archive this file? It moves to Archive at the bottom of this page. Reports that already use it keep it.";
const ARCHIVE_FOLDER_CONFIRM =
  "Archive this folder and everything inside it? You can restore it from Archive. Reports that already use these files keep them.";
const ARCHIVE_SELECTION_CONFIRM =
  "Archive the selected items? Folders take everything inside them. You can restore them from Archive. Reports that already use these files keep them.";

function buildArchiveChildren(
  folders: AttachmentLibraryFolderRecord[],
  assets: AttachmentLibraryAssetRecord[]
) {
  const archivedFolderIds = new Set(folders.map((folder) => folder.id));
  return buildFolderChildren(
    folders.map((folder) => ({
      ...folder,
      parentId:
        folder.parentId && archivedFolderIds.has(folder.parentId)
          ? folder.parentId
          : null,
    })),
    assets.map((asset) => ({
      ...asset,
      libraryFolderId:
        asset.libraryFolderId && archivedFolderIds.has(asset.libraryFolderId)
          ? asset.libraryFolderId
          : null,
    }))
  );
}

function buildFolderChildren(
  folders: AttachmentLibraryFolderRecord[],
  assets: AttachmentLibraryAssetRecord[]
) {
  const foldersByParent = new Map<
    string | null,
    AttachmentLibraryFolderRecord[]
  >();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    const list = foldersByParent.get(key) ?? [];
    list.push(folder);
    foldersByParent.set(key, list);
  }
  const assetsByFolder = new Map<string | null, AttachmentLibraryAssetRecord[]>();
  for (const asset of assets) {
    const key = asset.libraryFolderId ?? null;
    const list = assetsByFolder.get(key) ?? [];
    list.push(asset);
    assetsByFolder.set(key, list);
  }
  return { foldersByParent, assetsByFolder };
}

function isFolderUnderAny(
  folderId: string,
  ancestorIds: Set<string>,
  folders: AttachmentLibraryFolderRecord[]
): boolean {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  let cursor: string | null = folderId;
  while (cursor !== null) {
    if (ancestorIds.has(cursor)) return true;
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

function folderLabel(
  folder: AttachmentLibraryFolderRecord,
  folders: AttachmentLibraryFolderRecord[]
): string {
  const parts = [folder.name];
  let parentId = folder.parentId;
  while (parentId) {
    const parent = folders.find((item) => item.id === parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join(" / ");
}

function locationLabel(
  folderId: string | null,
  folders: AttachmentLibraryFolderRecord[]
): string {
  if (!folderId) return "Vault root";
  const folder = folders.find((item) => item.id === folderId);
  return folder ? folderLabel(folder, folders) : "Vault root";
}

function describeMoveSelection(
  assets: AttachmentLibraryAssetRecord[],
  folders: AttachmentLibraryFolderRecord[]
): string {
  const names = [
    ...folders.map((folder) => folder.name),
    ...assets.map((asset) => asset.filename),
  ];
  if (names.length === 0) return "the selected items";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

function LibraryProfileTree({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  inspectedAssetId,
  checkedAssetIds,
  checkedFolderIds,
  collapsedFolderIds,
  onInspectAsset,
  onOpenAsset,
  onToggleAssetCheck,
  onToggleFolderCheck,
  onToggleFolderCollapsed,
  onArchiveFolder,
  onArchiveAsset,
  onDropOnFolder,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  inspectedAssetId: string | null;
  checkedAssetIds: Set<string>;
  checkedFolderIds: Set<string>;
  collapsedFolderIds: Set<string>;
  onInspectAsset: (assetId: string) => void;
  onOpenAsset: (assetId: string) => void;
  onToggleAssetCheck: (assetId: string, checked: boolean) => void;
  onToggleFolderCheck: (folderId: string, checked: boolean) => void;
  onToggleFolderCollapsed: (folderId: string) => void;
  onArchiveFolder: (folderId: string) => void;
  onArchiveAsset: (assetId: string) => void;
  onDropOnFolder: (folderId: string | null, dataTransfer: DataTransfer) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];
  const indent = depth * 12 + 8;

  return (
    <div className="space-y-0.5">
      {childFolders.map((folder) => {
        const checked = checkedFolderIds.has(folder.id);
        const collapsed = collapsedFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded-md py-1 pr-2 hover:bg-[var(--secondary)]/50",
                checked && "bg-[var(--secondary)]/40"
              )}
              style={{ paddingLeft: `${indent}px` }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDropOnFolder(folder.id, event.dataTransfer);
              }}
            >
              <button
                type="button"
                aria-label={collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                onClick={() => onToggleFolderCollapsed(folder.id)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              >
                {collapsed ? (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggleFolderCheck(folder.id, value === true)
                }
                aria-label={`Select folder ${folder.name}`}
              />
              <button
                type="button"
                onClick={() => onToggleFolderCollapsed(folder.id)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left"
              >
                <Folder
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Archive folder ${folder.name}`}
                title="Archive folder"
                onClick={() => onArchiveFolder(folder.id)}
                className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] hover:text-[var(--destructive)] group-hover:opacity-100"
              >
                <Archive className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {collapsed ? null : (
              <LibraryProfileTree
                folderId={folder.id}
                depth={depth + 1}
                foldersByParent={foldersByParent}
                assetsByFolder={assetsByFolder}
                inspectedAssetId={inspectedAssetId}
                checkedAssetIds={checkedAssetIds}
                checkedFolderIds={checkedFolderIds}
                collapsedFolderIds={collapsedFolderIds}
                onInspectAsset={onInspectAsset}
                onOpenAsset={onOpenAsset}
                onToggleAssetCheck={onToggleAssetCheck}
                onToggleFolderCheck={onToggleFolderCheck}
                onToggleFolderCollapsed={onToggleFolderCollapsed}
                onArchiveFolder={onArchiveFolder}
                onArchiveAsset={onArchiveAsset}
                onDropOnFolder={onDropOnFolder}
              />
            )}
          </div>
        );
      })}
      {childAssets.map((asset) => {
        const checked = checkedAssetIds.has(asset.id);
        const inspected = inspectedAssetId === asset.id;
        return (
          <div
            key={asset.id}
            className={cn(
              "group flex items-start gap-2 rounded-md py-1.5 pr-2 transition-colors",
              inspected
                ? "bg-[var(--secondary)] text-[var(--foreground)]"
                : checked
                  ? "bg-[var(--secondary)]/40"
                  : "hover:bg-[var(--secondary)]/50"
            )}
            style={{ paddingLeft: `${indent + 20}px` }}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(value) =>
                onToggleAssetCheck(asset.id, value === true)
              }
              aria-label={`Select ${asset.filename}`}
              className="mt-0.5"
              onClick={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => onInspectAsset(asset.id)}
              onDoubleClick={() => onOpenAsset(asset.id)}
              className="min-w-0 flex-1 text-left"
              data-testid={`library-file-${asset.id}`}
            >
              <LibraryAssetLabel
                filename={asset.filename}
                uploadedAt={asset.uploadedAt}
                processingStatus={asset.processingStatus}
                processingProgress={asset.processingProgress}
              />
            </button>
            <button
              type="button"
              aria-label={`Archive ${asset.filename}`}
              title="Archive file"
              onClick={() => onArchiveAsset(asset.id)}
              className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] hover:text-[var(--destructive)] group-hover:opacity-100"
            >
              <Archive className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function LibraryArchiveTree({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  collapsedFolderIds,
  inspectedAssetId,
  onInspectAsset,
  onOpenAsset,
  onToggleFolderCollapsed,
  onUnarchiveFolder,
  onUnarchiveAsset,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  collapsedFolderIds: Set<string>;
  inspectedAssetId: string | null;
  onInspectAsset: (assetId: string) => void;
  onOpenAsset: (assetId: string) => void;
  onToggleFolderCollapsed: (folderId: string) => void;
  onUnarchiveFolder: (folderId: string) => void;
  onUnarchiveAsset: (assetId: string) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];
  const indent = depth * 12 + 8;

  return (
    <div className="space-y-0.5">
      {childFolders.map((folder) => {
        const collapsed = collapsedFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <div
              className="group flex items-center gap-1 rounded-md py-1 pr-2 hover:bg-[var(--secondary)]/50"
              style={{ paddingLeft: `${indent}px` }}
            >
              <button
                type="button"
                aria-label={collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                onClick={() => onToggleFolderCollapsed(folder.id)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              >
                {collapsed ? (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <Folder
                className="size-4 shrink-0 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
              <button
                type="button"
                aria-label={`Unarchive folder ${folder.name}`}
                title="Unarchive folder"
                onClick={() => onUnarchiveFolder(folder.id)}
                className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] group-hover:opacity-100"
              >
                <ArchiveRestore className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {collapsed ? null : (
              <LibraryArchiveTree
                folderId={folder.id}
                depth={depth + 1}
                foldersByParent={foldersByParent}
                assetsByFolder={assetsByFolder}
                collapsedFolderIds={collapsedFolderIds}
                inspectedAssetId={inspectedAssetId}
                onInspectAsset={onInspectAsset}
                onOpenAsset={onOpenAsset}
                onToggleFolderCollapsed={onToggleFolderCollapsed}
                onUnarchiveFolder={onUnarchiveFolder}
                onUnarchiveAsset={onUnarchiveAsset}
              />
            )}
          </div>
        );
      })}
      {childAssets.map((asset) => {
        const inspected = inspectedAssetId === asset.id;
        return (
          <div
            key={asset.id}
            className={cn(
              "group flex items-start gap-2 rounded-md py-1.5 pr-2",
              inspected
                ? "bg-[var(--secondary)] text-[var(--foreground)]"
                : "hover:bg-[var(--secondary)]/50"
            )}
            style={{ paddingLeft: `${indent + 20}px` }}
          >
            <button
              type="button"
              onClick={() => onInspectAsset(asset.id)}
              onDoubleClick={() => onOpenAsset(asset.id)}
              className="min-w-0 flex-1 text-left"
              data-testid={`library-archived-file-${asset.id}`}
            >
              <LibraryAssetLabel
                filename={asset.filename}
                uploadedAt={asset.uploadedAt}
                processingStatus={asset.processingStatus}
                processingProgress={asset.processingProgress}
              />
            </button>
            <button
              type="button"
              aria-label={`Unarchive ${asset.filename}`}
              title="Unarchive file"
              onClick={() => onUnarchiveAsset(asset.id)}
              className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] group-hover:opacity-100"
            >
              <ArchiveRestore className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function LibraryArchiveSection({
  folders,
  assets,
  inspectedAssetId,
  collapsedFolderIds,
  onInspectAsset,
  onOpenAsset,
  onToggleFolderCollapsed,
  onUnarchiveFolder,
  onUnarchiveAsset,
}: {
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
  inspectedAssetId: string | null;
  collapsedFolderIds: Set<string>;
  onInspectAsset: (assetId: string) => void;
  onOpenAsset: (assetId: string) => void;
  onToggleFolderCollapsed: (folderId: string) => void;
  onUnarchiveFolder: (folderId: string) => void;
  onUnarchiveAsset: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tree = useMemo(
    () => buildArchiveChildren(folders, assets),
    [folders, assets]
  );
  const count = folders.length + assets.length;

  return (
    <div
      className="shrink-0 border-t border-[var(--border)]"
      data-testid="library-archive"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--secondary)]/40"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="library-archive-toggle"
      >
        {open ? (
          <ChevronDown className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
        )}
        <Archive className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Archive
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">{count}</span>
      </button>
      {open ? (
        <div className="max-h-48 overflow-y-auto overscroll-contain px-2 pb-2">
          <LibraryArchiveTree
            folderId={null}
            depth={0}
            foldersByParent={tree.foldersByParent}
            assetsByFolder={tree.assetsByFolder}
            collapsedFolderIds={collapsedFolderIds}
            inspectedAssetId={inspectedAssetId}
            onInspectAsset={onInspectAsset}
            onOpenAsset={onOpenAsset}
            onToggleFolderCollapsed={onToggleFolderCollapsed}
            onUnarchiveFolder={onUnarchiveFolder}
            onUnarchiveAsset={onUnarchiveAsset}
          />
        </div>
      ) : null}
    </div>
  );
}

function MoveToFolderDialog({
  open,
  onOpenChange,
  itemLabel,
  itemCount,
  destination,
  onDestinationChange,
  destinationOptions,
  moving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemLabel: string;
  itemCount: number;
  destination: string | null;
  onDestinationChange: (value: string) => void;
  destinationOptions: { id: string; label: string }[];
  moving: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="library-move-dialog">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>
            Choose where to put {itemLabel}. Files already attached to reports
            stay on those reports.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="library-move-destination">Destination</Label>
          <Select
            value={destination ?? undefined}
            onValueChange={onDestinationChange}
          >
            <SelectTrigger
              id="library-move-destination"
              aria-label="Destination folder"
            >
              <SelectValue placeholder="Choose a folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIBRARY_ROOT}>Vault root</SelectItem>
              {destinationOptions.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={moving || destination == null}
            onClick={onConfirm}
            data-testid="library-move-confirm"
          >
            {moving
              ? "Moving…"
              : `Move ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LibraryAssetDetails({
  asset,
  folderOptions,
  shareCandidates,
  granteeIds,
  saving,
  archiving,
  onOpenPreview,
  onGranteeIdsChange,
  onSaveGrants,
  onArchiveOrRestore,
  onMoveThisFile,
}: {
  asset: AttachmentLibraryAssetRecord;
  folderOptions: AttachmentLibraryFolderRecord[];
  shareCandidates: WorkspaceUser[];
  granteeIds: string[];
  saving: boolean;
  archiving: boolean;
  onOpenPreview: () => void;
  onGranteeIdsChange: (ids: string[]) => void;
  onSaveGrants: () => void;
  onArchiveOrRestore: () => void;
  onMoveThisFile: () => void;
}) {
  const archived = asset.archivedAt != null;
  return (
    <div className="space-y-5 p-4" data-testid="library-details-pane">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium">{asset.filename}</h3>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          {archived ? "Archived" : `Uploaded ${formatLibraryUploadedAt(asset.uploadedAt)}`}
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={onOpenPreview}
        data-testid="library-open-preview"
      >
        <FileText className="size-3.5" aria-hidden="true" />
        Open preview
      </Button>

      {archived ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          This file is in Archive. Restore it to add it to new reports. Reports
          that already use it still have it.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Location</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {locationLabel(asset.libraryFolderId, folderOptions)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onMoveThisFile}
          >
            <FolderInput className="size-3.5" aria-hidden="true" />
            Move this file to a folder…
          </Button>
        </div>
      )}

      {archived ? null : (
        <>
          <div>
            <h3 className="text-sm font-medium">Shared with</h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Revoking access stops new reports from linking this file. Existing
              report links stay in place.
            </p>
          </div>
          <ManagerSelector
            managers={shareCandidates}
            selectedIds={granteeIds}
            onSelectedIdsChange={onGranteeIdsChange}
            placeholder="Add colleagues…"
            emptyMessage="No other workspace users are available."
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {archived ? null : (
          <Button type="button" disabled={saving} onClick={onSaveGrants}>
            {saving ? "Saving…" : "Save sharing"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={archiving}
          onClick={onArchiveOrRestore}
          className={
            archived
              ? undefined
              : "text-[var(--destructive)] hover:text-[var(--destructive)]"
          }
          data-testid="library-details-archive"
        >
          {archiving
            ? archived
              ? "Restoring…"
              : "Archiving…"
            : archived
              ? "Unarchive"
              : "Archive"}
        </Button>
      </div>
    </div>
  );
}

export function DocumentLibrarySection({
  currentUser,
  workspaceUsers,
  hideIntro = false,
}: Props) {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [checkedAssetIds, setCheckedAssetIds] = useState<Set<string>>(
    () => new Set()
  );
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [granteeIds, setGranteeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploading, setUploading] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/attachment-vault?scope=mine");
      const data = (await response.json().catch(() => ({}))) as LibraryResponse & {
        error?: string;
      };
      if (!response.ok) {
        if (!options?.silent) {
          toast.error(data.error ?? "Could not load your document vault");
        }
        return;
      }
      setLibrary({
        folders: data.folders ?? [],
        assets: data.assets ?? [],
        archivedFolders: data.archivedFolders ?? [],
        archivedAssets: data.archivedAssets ?? [],
      });
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const hasIndexingAssets = (library?.assets ?? []).some(
    (asset) =>
      asset.processingStatus === "validating" ||
      asset.processingStatus === "queued" ||
      asset.processingStatus === "processing"
  );

  useEffect(() => {
    if (!hasIndexingAssets) return;
    const timer = window.setInterval(() => {
      void loadLibrary({ silent: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasIndexingAssets, loadLibrary]);

  const loadGrants = useCallback(async (assetId: string) => {
    const response = await fetch(`/api/attachment-vault/${assetId}/access`);
    const data = (await response.json().catch(() => ({}))) as {
      grants?: { granteeUserId: string }[];
      error?: string;
    };
    if (!response.ok) {
      toast.error(data.error ?? "Could not load sharing settings");
      setGranteeIds([]);
      return;
    }
    setGranteeIds(data.grants?.map((grant) => grant.granteeUserId) ?? []);
  }, []);

  const inspectAsset = useCallback(
    (assetId: string) => {
      setInspectedAssetId(assetId);
      setPreviewAssetId(null);
      void loadGrants(assetId);
    },
    [loadGrants]
  );

  const openPreview = useCallback(
    (assetId: string) => {
      setInspectedAssetId(assetId);
      setPreviewAssetId(assetId);
      void loadGrants(assetId);
    },
    [loadGrants]
  );

  const closePreview = useCallback(() => {
    setPreviewAssetId(null);
  }, []);

  const checkedCount = checkedAssetIds.size + checkedFolderIds.size;
  const inspectedIsArchived =
    library?.archivedAssets.some((asset) => asset.id === inspectedAssetId) ??
    false;
  const moveItemCount =
    checkedCount > 0
      ? checkedCount
      : inspectedAssetId && !inspectedIsArchived
        ? 1
        : 0;

  const saveGrants = async () => {
    if (!inspectedAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-vault/${inspectedAssetId}/access`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ granteeUserIds: granteeIds }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not update sharing");
        return;
      }
      toast.success("Sharing updated");
    } finally {
      setSaving(false);
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    const response = await fetch("/api/attachment-vault/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: null }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(data.error ?? "Could not create folder");
      return;
    }
    setNewFolderName("");
    setCreatingFolder(false);
    await loadLibrary();
  };

  const postArchiveChange = async (
    path: "archive" | "unarchive",
    payload: { assetIds: string[]; folderIds: string[] }
  ) => {
    setArchiving(true);
    try {
      const response = await fetch(`/api/attachment-vault/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(
          data.error ??
            (path === "archive" ? "Could not archive" : "Could not unarchive")
        );
        return false;
      }
      await loadLibrary();
      return true;
    } finally {
      setArchiving(false);
    }
  };

  const archiveItems = async (assetIds: string[], folderIds: string[]) => {
    if (assetIds.length === 0 && folderIds.length === 0) return;
    const confirmMessage =
      folderIds.length > 0 && assetIds.length === 0 && folderIds.length === 1
        ? ARCHIVE_FOLDER_CONFIRM
        : assetIds.length === 1 && folderIds.length === 0
          ? ARCHIVE_FILE_CONFIRM
          : ARCHIVE_SELECTION_CONFIRM;
    if (!window.confirm(confirmMessage)) return;
    const ok = await postArchiveChange("archive", { assetIds, folderIds });
    if (!ok) return;
    setCheckedAssetIds((prev) => {
      const next = new Set(prev);
      for (const id of assetIds) next.delete(id);
      return next;
    });
    setCheckedFolderIds((prev) => {
      const next = new Set(prev);
      for (const id of folderIds) next.delete(id);
      return next;
    });
    if (assetIds.includes(inspectedAssetId ?? "")) {
      setInspectedAssetId(null);
      setPreviewAssetId(null);
      setGranteeIds([]);
    }
    toast.success("Moved to Archive");
  };

  const unarchiveItems = async (assetIds: string[], folderIds: string[]) => {
    const ok = await postArchiveChange("unarchive", { assetIds, folderIds });
    if (!ok) return;
    toast.success("Restored from Archive");
  };

  const openMoveDialog = (scope: "checked" | "inspected") => {
    if (scope === "inspected" && inspectedAssetId) {
      setCheckedAssetIds(new Set([inspectedAssetId]));
      setCheckedFolderIds(new Set());
    }
    setMoveDestination(null);
    setMoveDialogOpen(true);
  };

  const confirmMove = async () => {
    if (moveDestination == null) return;
    const assetIds =
      checkedAssetIds.size > 0
        ? [...checkedAssetIds]
        : inspectedAssetId
          ? [inspectedAssetId]
          : [];
    const folderIds = [...checkedFolderIds];
    if (assetIds.length === 0 && folderIds.length === 0) return;

    setMoving(true);
    try {
      const response = await fetch("/api/attachment-vault/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIds,
          folderIds,
          targetFolderId: moveDestination === LIBRARY_ROOT ? null : moveDestination,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        movedAssets?: number;
        movedFolders?: number;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not move selection");
        return;
      }
      const moved = (data.movedAssets ?? 0) + (data.movedFolders ?? 0);
      const destinationName =
        moveDestination === LIBRARY_ROOT
          ? "vault root"
          : library?.folders.find((folder) => folder.id === moveDestination)
              ?.name ?? "the selected folder";
      toast.success(
        `Moved ${moved} item${moved === 1 ? "" : "s"} to ${destinationName}`
      );
      setCheckedAssetIds(new Set());
      setCheckedFolderIds(new Set());
      setMoveDialogOpen(false);
      setMoveDestination(null);
      await loadLibrary();
    } finally {
      setMoving(false);
    }
  };

  const uploadLibraryBatch = async (
    files: LibraryUploadFile[],
    targetFolderId: string | null
  ) => {
    if (files.length === 0) return;
    let failed = 0;
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index]!;
      setUploading({
        current: index + 1,
        total: files.length,
        filename: item.file.name,
      });
      try {
        await uploadFileToLibrary({
          file: item.file,
          libraryFolderId: targetFolderId,
          relativePath: item.relativePath,
        });
      } catch (error) {
        failed += 1;
        toast.error(
          error instanceof Error
            ? error.message
            : `Could not upload ${item.file.name}`
        );
      }
    }
    setUploading(null);
    await loadLibrary();
    const uploaded = files.length - failed;
    if (uploaded > 0) {
      toast.success(
        uploaded === 1
          ? "Uploaded 1 file to your vault"
          : `Uploaded ${uploaded} files to your vault`
      );
    }
  };

  const startLibraryUpload = (
    scan: ReturnType<typeof libraryUploadFilesFromList>,
    targetFolderId: string | null
  ) => {
    const error = libraryUploadBatchError(
      scan,
      libraryTargetFolderDepth(library?.folders ?? [], targetFolderId)
    );
    if (error) {
      toast.error(error);
      return;
    }
    void uploadLibraryBatch(scan.accepted, targetFolderId);
  };

  const handleSelectedFiles = (
    fileList: FileList | null,
    targetFolderId: string | null
  ) => {
    if (!fileList || fileList.length === 0) return;
    startLibraryUpload(libraryUploadFilesFromList(fileList), targetFolderId);
  };

  const handleDropOnFolder = async (
    folderId: string | null,
    dataTransfer: DataTransfer
  ) => {
    startLibraryUpload(
      await libraryUploadFilesFromDataTransfer(dataTransfer),
      folderId
    );
  };

  const tree = useMemo(() => {
    if (!library) {
      return { foldersByParent: new Map(), assetsByFolder: new Map() };
    }
    return buildFolderChildren(library.folders, library.assets);
  }, [library]);

  const assetById = useMemo(() => {
    const map = new Map<string, AttachmentLibraryAssetRecord>();
    for (const asset of library?.assets ?? []) {
      map.set(asset.id, asset);
    }
    for (const asset of library?.archivedAssets ?? []) {
      map.set(asset.id, asset);
    }
    return map;
  }, [library?.assets, library?.archivedAssets]);

  const inspectedAsset = inspectedAssetId
    ? assetById.get(inspectedAssetId)
    : undefined;
  const previewAsset = previewAssetId ? assetById.get(previewAssetId) : undefined;
  const shareCandidates = workspaceUsers.filter(
    (user) => user.id !== currentUser.id
  );
  const folderOptions = library?.folders ?? [];

  const moveTargetOptions = folderOptions.filter(
    (folder) =>
      !checkedFolderIds.has(folder.id) &&
      !isFolderUnderAny(folder.id, checkedFolderIds, folderOptions)
  );

  const movingAssets =
    checkedAssetIds.size > 0
      ? [...checkedAssetIds]
          .map((id) => assetById.get(id))
          .filter((asset): asset is AttachmentLibraryAssetRecord => asset != null)
      : inspectedAsset
        ? [inspectedAsset]
        : [];
  const movingFolders = folderOptions.filter((folder) =>
    checkedFolderIds.has(folder.id)
  );

  const isEmpty =
    !library || (library.assets.length === 0 && library.folders.length === 0);
  const previewOpen = previewAsset != null;

  useEffect(() => {
    if (!library) return;
    const knownIds = new Set([
      ...library.assets.map((asset) => asset.id),
      ...library.archivedAssets.map((asset) => asset.id),
    ]);
    setInspectedAssetId((active) =>
      active && knownIds.has(active) ? active : null
    );
    setPreviewAssetId((preview) =>
      preview && knownIds.has(preview) ? preview : null
    );
  }, [library]);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      {hideIntro ? null : (
        <>
          <h2 className="text-base font-semibold">Document vault</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Upload files or folders here, or drop them onto a folder. Nested
            folders are kept. A folder must contain only PDF and Word files —
            anything else stops the upload before it starts. Click a file to
            see details. Open a preview when you want to read it. Archive hides
            a file from this list; reports that already use it keep it. Restore
            from Archive at the bottom of the file list.
          </p>
        </>
      )}

      {loading ? (
        <div
          className={cn(
            "flex items-center gap-2 text-sm text-[var(--muted-foreground)]",
            hideIntro ? null : "mt-6"
          )}
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading vault…
        </div>
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-col overflow-hidden rounded-md border border-[var(--border)] lg:flex-row",
            hideIntro ? null : "mt-5",
            previewOpen
              ? "h-[min(70vh,720px)]"
              : "lg:min-h-[280px]"
          )}
          data-testid="library-explorer"
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col border-b border-[var(--border)] lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r",
              previewOpen ? "h-full" : "max-h-[min(420px,50vh)] lg:max-h-none"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Files
              </p>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={uploading != null}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="library-upload-files"
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                  Upload files
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={uploading != null}
                  onClick={() => folderInputRef.current?.click()}
                  data-testid="library-upload-folder"
                >
                  <FolderUp className="size-3.5" aria-hidden="true" />
                  Upload folder
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={moveItemCount === 0 || uploading != null}
                  title={
                    moveItemCount === 0
                      ? "Select a file or folder first"
                      : checkedCount > 0
                        ? "Choose a destination folder for the checked items"
                        : `Choose a destination folder for ${inspectedAsset?.filename ?? "this file"}`
                  }
                  onClick={() => openMoveDialog("checked")}
                  data-testid="library-move-to-folder"
                >
                  <FolderInput className="size-3.5" aria-hidden="true" />
                  {checkedCount > 0
                    ? `Move ${checkedCount} to folder…`
                    : "Move to folder…"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={
                    uploading != null ||
                    (checkedCount === 0 &&
                      (!inspectedAssetId || inspectedIsArchived))
                  }
                  title={
                    checkedCount > 0
                      ? "Archive the checked items"
                      : inspectedAssetId && !inspectedIsArchived
                        ? `Archive ${inspectedAsset?.filename ?? "this file"}`
                        : "Select a file or folder first"
                  }
                  onClick={() => {
                    if (checkedCount > 0) {
                      void archiveItems([...checkedAssetIds], [...checkedFolderIds]);
                      return;
                    }
                    if (inspectedAssetId && !inspectedIsArchived) {
                      void archiveItems([inspectedAssetId], []);
                    }
                  }}
                  data-testid="library-archive-selected"
                >
                  <Archive className="size-3.5" aria-hidden="true" />
                  {checkedCount > 0 ? `Archive ${checkedCount}` : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={uploading != null}
                  onClick={() => setCreatingFolder(true)}
                >
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                  New folder
                </Button>
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleDropOnFolder(null, event.dataTransfer);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT_ATTR}
                multiple
                className="hidden"
                data-testid="library-upload-files-input"
                onChange={(event) => {
                  handleSelectedFiles(event.target.files, null);
                  event.target.value = "";
                }}
              />
              <input
                ref={(node) => {
                  folderInputRef.current = node;
                  if (node) {
                    node.setAttribute("webkitdirectory", "");
                    node.setAttribute("directory", "");
                  }
                }}
                type="file"
                multiple
                className="hidden"
                data-testid="library-upload-folder-input"
                onChange={(event) => {
                  handleSelectedFiles(event.target.files, null);
                  event.target.value = "";
                }}
              />
              {creatingFolder ? (
                <input
                  autoFocus
                  aria-label="New folder name"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onBlur={() => void createFolder()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createFolder();
                    if (event.key === "Escape") {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                />
              ) : null}

              {uploading ? (
                <p className="mb-2 px-1 text-xs text-[var(--muted-foreground)]">
                  Uploading {uploading.current} of {uploading.total} ·{" "}
                  {uploading.filename}
                </p>
              ) : checkedCount > 0 ? (
                <p className="mb-2 px-1 text-xs text-[var(--muted-foreground)]">
                  {checkedCount} selected. Choose a destination with{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    Move {checkedCount} to folder…
                  </span>
                </p>
              ) : inspectedAsset && !previewOpen ? (
                <p className="mb-2 px-1 text-xs text-[var(--muted-foreground)]">
                  {inspectedAsset.filename} is selected.{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    Move to folder…
                  </span>{" "}
                  picks where it goes.
                </p>
              ) : isEmpty ? (
                <p className="mb-2 px-1 text-xs text-[var(--muted-foreground)]">
                  Drop a folder of PDF and Word files, or use Upload files /
                  Upload folder. Other file types stop the upload.
                </p>
              ) : null}

              <LibraryProfileTree
                folderId={null}
                depth={0}
                foldersByParent={tree.foldersByParent}
                assetsByFolder={tree.assetsByFolder}
                inspectedAssetId={inspectedAssetId}
                checkedAssetIds={checkedAssetIds}
                checkedFolderIds={checkedFolderIds}
                collapsedFolderIds={collapsedFolderIds}
                onInspectAsset={inspectAsset}
                onOpenAsset={openPreview}
                onToggleAssetCheck={(id, checked) => {
                  setCheckedAssetIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  });
                }}
                onToggleFolderCheck={(id, checked) => {
                  setCheckedFolderIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  });
                }}
                onToggleFolderCollapsed={(id) => {
                  setCollapsedFolderIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onArchiveFolder={(folderId) => void archiveItems([], [folderId])}
                onArchiveAsset={(assetId) => void archiveItems([assetId], [])}
                onDropOnFolder={(folderId, dataTransfer) =>
                  void handleDropOnFolder(folderId, dataTransfer)
                }
              />
            </div>
            {(library?.archivedFolders.length ?? 0) +
              (library?.archivedAssets.length ?? 0) >
            0 ? (
              <LibraryArchiveSection
                folders={library?.archivedFolders ?? []}
                assets={library?.archivedAssets ?? []}
                inspectedAssetId={inspectedAssetId}
                collapsedFolderIds={collapsedFolderIds}
                onInspectAsset={inspectAsset}
                onOpenAsset={openPreview}
                onToggleFolderCollapsed={(id) => {
                  setCollapsedFolderIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onUnarchiveFolder={(folderId) =>
                  void unarchiveItems([], [folderId])
                }
                onUnarchiveAsset={(assetId) => void unarchiveItems([assetId], [])}
              />
            ) : null}
          </div>

          {previewAsset ? (
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--background)]"
              data-testid="library-preview-pane"
            >
              <AttachmentPreviewPanel
                testId="library-asset-preview"
                attachment={{
                  id: previewAsset.id,
                  filename: previewAsset.filename,
                  description: previewAsset.description,
                  mimeType: previewAsset.mimeType,
                  sizeBytes: previewAsset.sizeBytes,
                  pageCount: previewAsset.pageCount,
                  processingStatus: previewAsset.processingStatus,
                  processingPage: previewAsset.processingPage,
                  processingError: previewAsset.processingError,
                }}
                previewUrl={libraryPreviewSrc({
                  assetId: previewAsset.id,
                  mimeType: previewAsset.mimeType,
                  page: 1,
                })}
                downloadUrl={libraryDownloadHref(previewAsset.id)}
                onClose={closePreview}
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--background)]">
              {inspectedAsset ? (
                <LibraryAssetDetails
                  asset={inspectedAsset}
                  folderOptions={folderOptions}
                  shareCandidates={shareCandidates}
                  granteeIds={granteeIds}
                  saving={saving}
                  archiving={archiving}
                  onOpenPreview={() => openPreview(inspectedAsset.id)}
                  onGranteeIdsChange={setGranteeIds}
                  onSaveGrants={() => void saveGrants()}
                  onArchiveOrRestore={() => {
                    if (inspectedAsset.archivedAt) {
                      void unarchiveItems([inspectedAsset.id], []);
                      return;
                    }
                    void archiveItems([inspectedAsset.id], []);
                  }}
                  onMoveThisFile={() => openMoveDialog("inspected")}
                />
              ) : (
                <p className="p-6 text-sm text-[var(--muted-foreground)]">
                  {isEmpty
                    ? "Upload PDF or Word files, or drop a folder, to start your vault."
                    : "Click a file to see its details. Double-click, or use Open preview, to read it. Check files or folders, then Move to folder, to organize them."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        itemLabel={describeMoveSelection(movingAssets, movingFolders)}
        itemCount={Math.max(moveItemCount, 1)}
        destination={moveDestination}
        onDestinationChange={setMoveDestination}
        destinationOptions={moveTargetOptions.map((folder) => ({
          id: folder.id,
          label: folderLabel(folder, folderOptions),
        }))}
        moving={moving}
        onConfirm={() => void confirmMove()}
      />
    </section>
  );
}
