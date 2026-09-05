"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  Trash2,
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
  libraryDownloadHref,
  libraryPreviewSrc,
} from "@/lib/attachments/preview-urls";
import { cn } from "@/lib/utils";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

const LIBRARY_ROOT = "__library_root__";

type Props = {
  currentUser: Pick<WorkspaceUser, "id" | "role">;
  workspaceUsers: WorkspaceUser[];
};

type LibraryResponse = {
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
};

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
  if (!folderId) return "Library root";
  const folder = folders.find((item) => item.id === folderId);
  return folder ? folderLabel(folder, folders) : "Library root";
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
  onDeleteFolder,
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
  onDeleteFolder: (folderId: string) => void;
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
                aria-label={`Delete folder ${folder.name}`}
                title="Delete folder"
                onClick={() => onDeleteFolder(folder.id)}
                className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] hover:text-[var(--destructive)] group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
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
                onDeleteFolder={onDeleteFolder}
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
              "flex items-start gap-2 rounded-md py-1.5 pr-2 transition-colors",
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
              />
            </button>
          </div>
        );
      })}
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
              <SelectItem value={LIBRARY_ROOT}>Library root</SelectItem>
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
  deleting,
  onOpenPreview,
  onGranteeIdsChange,
  onSaveGrants,
  onDeleteAsset,
  onMoveThisFile,
}: {
  asset: AttachmentLibraryAssetRecord;
  folderOptions: AttachmentLibraryFolderRecord[];
  shareCandidates: WorkspaceUser[];
  granteeIds: string[];
  saving: boolean;
  deleting: boolean;
  onOpenPreview: () => void;
  onGranteeIdsChange: (ids: string[]) => void;
  onSaveGrants: () => void;
  onDeleteAsset: () => void;
  onMoveThisFile: () => void;
}) {
  return (
    <div className="space-y-5 p-4" data-testid="library-details-pane">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium">{asset.filename}</h3>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          Uploaded {formatLibraryUploadedAt(asset.uploadedAt)}
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={onSaveGrants}
        >
          {saving ? "Saving…" : "Save sharing"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={deleting}
          onClick={onDeleteAsset}
          className="text-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          {deleting ? "Removing…" : "Remove from library"}
        </Button>
      </div>
    </div>
  );
}

export function DocumentLibrarySection({ currentUser, workspaceUsers }: Props) {
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
  const [deleting, setDeleting] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/attachment-library?scope=mine");
      const data = (await response.json().catch(() => ({}))) as LibraryResponse & {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not load your document library");
        return;
      }
      setLibrary({ folders: data.folders ?? [], assets: data.assets ?? [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const loadGrants = useCallback(async (assetId: string) => {
    const response = await fetch(`/api/attachment-library/${assetId}/access`);
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
  const moveItemCount =
    checkedCount > 0 ? checkedCount : inspectedAssetId ? 1 : 0;

  const saveGrants = async () => {
    if (!inspectedAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${inspectedAssetId}/access`,
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
    const response = await fetch("/api/attachment-library/folders", {
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

  const deleteFolder = async (folderId: string) => {
    if (
      !window.confirm(
        "Delete this folder? Files inside move to the parent folder. Reports are not affected."
      )
    ) {
      return;
    }
    const response = await fetch(`/api/attachment-library/folders/${folderId}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(data.error ?? "Could not delete folder");
      return;
    }
    setCheckedFolderIds((prev) => {
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
    await loadLibrary();
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
      const response = await fetch("/api/attachment-library/move", {
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
          ? "library root"
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

  const deleteInspectedAsset = async () => {
    if (!inspectedAssetId) return;
    if (
      !window.confirm(
        "Remove this file from your library? It will stay on reports that already use it, but you cannot add it to new reports."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${inspectedAssetId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove file");
        return;
      }
      const closedId = inspectedAssetId;
      setInspectedAssetId(null);
      setPreviewAssetId((preview) => (preview === closedId ? null : preview));
      setGranteeIds([]);
      setCheckedAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(closedId);
        return next;
      });
      await loadLibrary();
      toast.success("Removed from library");
    } finally {
      setDeleting(false);
    }
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
    return map;
  }, [library?.assets]);

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
    const liveIds = new Set(library.assets.map((asset) => asset.id));
    setInspectedAssetId((active) =>
      active && liveIds.has(active) ? active : null
    );
    setPreviewAssetId((preview) =>
      preview && liveIds.has(preview) ? preview : null
    );
  }, [library]);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <h2 className="text-base font-semibold">Document library</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Click a file to see details. Open a preview when you want to read it.
        Check items to move them into a folder. Files already on reports stay
        there if you remove them from the library.
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading library…
        </div>
      ) : isEmpty ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          You have not uploaded any library documents yet. Upload a PDF or Word
          file in a report to add it here.
        </p>
      ) : (
        <div
          className={cn(
            "mt-5 flex min-w-0 flex-col overflow-hidden rounded-md border border-[var(--border)] lg:flex-row",
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
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={moveItemCount === 0}
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
                  onClick={() => setCreatingFolder(true)}
                >
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                  New folder
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
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

              {checkedCount > 0 ? (
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
                onDeleteFolder={(folderId) => void deleteFolder(folderId)}
              />
            </div>
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
                  deleting={deleting}
                  onOpenPreview={() => openPreview(inspectedAsset.id)}
                  onGranteeIdsChange={setGranteeIds}
                  onSaveGrants={() => void saveGrants()}
                  onDeleteAsset={() => void deleteInspectedAsset()}
                  onMoveThisFile={() => openMoveDialog("inspected")}
                />
              ) : (
                <p className="p-6 text-sm text-[var(--muted-foreground)]">
                  Click a file to see its details. Double-click, or use Open
                  preview, to read it. Check files or folders, then Move to
                  folder, to organize them.
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
