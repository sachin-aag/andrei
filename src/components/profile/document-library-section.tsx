"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Folder, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPreviewPanel } from "@/components/report/attachment-preview-panel";
import { ManagerSelector } from "@/components/report/manager-selector";
import { WorkProductTabs } from "@/components/report/work-product-tabs";
import {
  attachmentIdFromTab,
  attachmentTabId,
  type CanvasTabId,
} from "@/components/report/work-product-canvas";
import { LibraryAssetLabel } from "@/components/profile/library-asset-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type Props = {
  currentUser: Pick<WorkspaceUser, "id" | "role">;
  workspaceUsers: WorkspaceUser[];
};

type LibraryResponse = {
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
};

type RightPanelTab = "preview" | "details";

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

function LibraryProfileTree({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  activeAssetId,
  checkedAssetIds,
  checkedFolderIds,
  onOpenAsset,
  onToggleAssetCheck,
  onToggleFolderCheck,
  onDeleteFolder,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  activeAssetId: string | null;
  checkedAssetIds: Set<string>;
  checkedFolderIds: Set<string>;
  onOpenAsset: (assetId: string) => void;
  onToggleAssetCheck: (assetId: string, checked: boolean) => void;
  onToggleFolderCheck: (folderId: string, checked: boolean) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];
  const indent = depth * 12 + 8;

  return (
    <div className="space-y-0.5">
      {childFolders.map((folder) => {
        const checked = checkedFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <div
              className={cn(
                "group flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-[var(--secondary)]/50",
                checked && "bg-[var(--secondary)]/40"
              )}
              style={{ paddingLeft: `${indent}px` }}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggleFolderCheck(folder.id, value === true)
                }
                aria-label={`Select folder ${folder.name}`}
              />
              <Folder
                className="size-4 shrink-0 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
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
            <LibraryProfileTree
              folderId={folder.id}
              depth={depth + 1}
              foldersByParent={foldersByParent}
              assetsByFolder={assetsByFolder}
              activeAssetId={activeAssetId}
              checkedAssetIds={checkedAssetIds}
              checkedFolderIds={checkedFolderIds}
              onOpenAsset={onOpenAsset}
              onToggleAssetCheck={onToggleAssetCheck}
              onToggleFolderCheck={onToggleFolderCheck}
              onDeleteFolder={onDeleteFolder}
            />
          </div>
        );
      })}
      {childAssets.map((asset) => {
        const checked = checkedAssetIds.has(asset.id);
        const active = activeAssetId === asset.id;
        return (
          <div
            key={asset.id}
            className={cn(
              "flex items-start gap-2 rounded-md py-1.5 pr-2 transition-colors",
              active
                ? "bg-[var(--secondary)] text-[var(--foreground)]"
                : checked
                  ? "bg-[var(--secondary)]/40"
                  : "hover:bg-[var(--secondary)]/50"
            )}
            style={{ paddingLeft: `${indent}px` }}
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
              onClick={() => onOpenAsset(asset.id)}
              className="min-w-0 flex-1 text-left"
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

function LibraryAssetDetails({
  asset,
  selectionCount,
  folderOptions,
  shareCandidates,
  granteeIds,
  moving,
  saving,
  deleting,
  onGranteeIdsChange,
  onMoveAsset,
  onSaveGrants,
  onDeleteAsset,
}: {
  asset: AttachmentLibraryAssetRecord;
  selectionCount: number;
  folderOptions: AttachmentLibraryFolderRecord[];
  shareCandidates: WorkspaceUser[];
  granteeIds: string[];
  moving: boolean;
  saving: boolean;
  deleting: boolean;
  onGranteeIdsChange: (ids: string[]) => void;
  onMoveAsset: (libraryFolderId: string | null) => void;
  onSaveGrants: () => void;
  onDeleteAsset: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium">{asset.filename}</h3>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          Uploaded {formatLibraryUploadedAt(asset.uploadedAt)}
        </p>
      </div>

      {selectionCount <= 1 ? (
        <div className="space-y-2">
          <label htmlFor="library-folder-move" className="text-sm font-medium">
            Folder
          </label>
          <select
            id="library-folder-move"
            disabled={moving}
            value={asset.libraryFolderId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onMoveAsset(value === "" ? null : value);
            }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          >
            <option value="">Top level</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderLabel(folder, folderOptions)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Use the move bar in the file list to relocate {selectionCount} selected
          items.
        </p>
      )}

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
        <button
          type="button"
          onClick={onSaveGrants}
          disabled={saving}
          className="inline-flex items-center rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save sharing"}
        </button>
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
  const [openAssetIds, setOpenAssetIds] = useState<string[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [checkedAssetIds, setCheckedAssetIds] = useState<Set<string>>(
    () => new Set()
  );
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [granteeIds, setGranteeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [bulkMoveTarget, setBulkMoveTarget] = useState("");
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

  const openAsset = useCallback(
    (assetId: string) => {
      setOpenAssetIds((prev) =>
        prev.includes(assetId) ? prev : [...prev, assetId]
      );
      setActiveAssetId(assetId);
      setRightPanelTab("preview");
      void loadGrants(assetId);
    },
    [loadGrants]
  );

  const closeAssetTab = useCallback((tabId: CanvasTabId) => {
    const assetId = attachmentIdFromTab(tabId);
    if (!assetId) return;
    setOpenAssetIds((prev) => {
      const next = prev.filter((id) => id !== assetId);
      setActiveAssetId((active) => {
        if (active !== assetId) return active;
        const index = prev.indexOf(assetId);
        if (index <= 0) return next[0] ?? null;
        return next[index - 1] ?? next[0] ?? null;
      });
      return next;
    });
  }, []);

  const selectionCount = checkedAssetIds.size + checkedFolderIds.size;

  const saveGrants = async () => {
    if (!activeAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${activeAssetId}/access`,
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

  const moveActiveAsset = async (libraryFolderId: string | null) => {
    if (!activeAssetId) return;
    setMoving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${activeAssetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ libraryFolderId }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not move file");
        return;
      }
      await loadLibrary();
    } finally {
      setMoving(false);
    }
  };

  const bulkMoveSelection = async () => {
    if (selectionCount === 0) return;
    setMoving(true);
    try {
      const response = await fetch("/api/attachment-library/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIds: [...checkedAssetIds],
          folderIds: [...checkedFolderIds],
          targetFolderId: bulkMoveTarget === "" ? null : bulkMoveTarget,
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
      const moved =
        (data.movedAssets ?? 0) + (data.movedFolders ?? 0);
      toast.success(`Moved ${moved} item${moved === 1 ? "" : "s"}`);
      setCheckedAssetIds(new Set());
      setCheckedFolderIds(new Set());
      setBulkMoveTarget("");
      await loadLibrary();
    } finally {
      setMoving(false);
    }
  };

  const deleteActiveAsset = async () => {
    if (!activeAssetId) return;
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
        `/api/attachment-library/${activeAssetId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove file");
        return;
      }
      const closedId = activeAssetId;
      setOpenAssetIds((prev) => prev.filter((id) => id !== closedId));
      setActiveAssetId((active) => (active === closedId ? null : active));
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

  const activeAsset = activeAssetId ? assetById.get(activeAssetId) : undefined;
  const shareCandidates = workspaceUsers.filter(
    (user) => user.id !== currentUser.id
  );
  const folderOptions = library?.folders ?? [];

  const moveTargetOptions = folderOptions.filter(
    (folder) =>
      !checkedFolderIds.has(folder.id) &&
      !isFolderUnderAny(folder.id, checkedFolderIds, folderOptions)
  );

  const openTabs = useMemo(() => {
    return openAssetIds
      .map((id) => assetById.get(id))
      .filter((asset): asset is AttachmentLibraryAssetRecord => asset != null)
      .map((asset) => ({
        id: attachmentTabId(asset.id),
        label: asset.filename,
        testId: `library-asset-tab-${asset.id}`,
        closable: true,
        closeAriaLabel: `Close ${asset.filename}`,
      }));
  }, [openAssetIds, assetById]);

  useEffect(() => {
    if (!library) return;
    const liveIds = new Set(library.assets.map((asset) => asset.id));
    setOpenAssetIds((prev) => {
      const next = prev.filter((id) => liveIds.has(id));
      return next.length === prev.length ? prev : next;
    });
    setActiveAssetId((active) =>
      active && liveIds.has(active) ? active : null
    );
  }, [library]);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <h2 className="text-base font-semibold">Document library</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Browse your files, open previews, organize folders, and manage sharing.
        Files already on reports stay there if you remove them from the library.
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading library…
        </div>
      ) : !library || library.assets.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          You have not uploaded any library documents yet. Upload a PDF or Word
          file in a report to add it here.
        </p>
      ) : (
        <div className="mt-5 flex min-h-[min(560px,70vh)] min-w-0 flex-col gap-0 overflow-hidden rounded-md border border-[var(--border)] lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-[var(--border)] lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Your files
              </p>
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

              {selectionCount > 0 ? (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-2 py-2">
                  <span className="text-xs font-medium text-[var(--foreground)]">
                    {selectionCount} selected
                  </span>
                  <select
                    aria-label="Move selected items to folder"
                    value={bulkMoveTarget}
                    onChange={(event) => setBulkMoveTarget(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                  >
                    <option value="">Top level</option>
                    {moveTargetOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folderLabel(folder, folderOptions)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 text-xs"
                    disabled={moving}
                    onClick={() => void bulkMoveSelection()}
                  >
                    {moving ? "Moving…" : "Move"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-xs"
                    onClick={() => {
                      setCheckedAssetIds(new Set());
                      setCheckedFolderIds(new Set());
                    }}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}

              <LibraryProfileTree
                folderId={null}
                depth={0}
                foldersByParent={tree.foldersByParent}
                assetsByFolder={tree.assetsByFolder}
                activeAssetId={activeAssetId}
                checkedAssetIds={checkedAssetIds}
                checkedFolderIds={checkedFolderIds}
                onOpenAsset={openAsset}
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
                onDeleteFolder={(folderId) => void deleteFolder(folderId)}
              />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background)]">
            {openTabs.length > 0 && activeAsset ? (
              <>
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-2 pt-1">
                  <WorkProductTabs
                    tabs={openTabs}
                    value={attachmentTabId(activeAsset.id)}
                    onChange={(tabId) => {
                      const assetId = attachmentIdFromTab(tabId);
                      if (!assetId) return;
                      setActiveAssetId(assetId);
                      void loadGrants(assetId);
                    }}
                    onClose={closeAssetTab}
                  />
                </div>
                <Tabs
                  value={rightPanelTab}
                  onValueChange={(value) =>
                    setRightPanelTab(value as RightPanelTab)
                  }
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <TabsList className="h-8 w-auto">
                      <TabsTrigger value="preview" className="text-xs">
                        Preview
                      </TabsTrigger>
                      <TabsTrigger value="details" className="text-xs">
                        Details
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent
                    value="preview"
                    className="mt-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col"
                  >
                    <AttachmentPreviewPanel
                      testId="library-asset-preview"
                      showClose={false}
                      attachment={{
                        id: activeAsset.id,
                        filename: activeAsset.filename,
                        description: activeAsset.description,
                        mimeType: activeAsset.mimeType,
                        sizeBytes: activeAsset.sizeBytes,
                        pageCount: activeAsset.pageCount,
                        processingStatus: activeAsset.processingStatus,
                        processingPage: activeAsset.processingPage,
                        processingError: activeAsset.processingError,
                      }}
                      previewUrl={libraryPreviewSrc({
                        assetId: activeAsset.id,
                        mimeType: activeAsset.mimeType,
                        page: 1,
                      })}
                      downloadUrl={libraryDownloadHref(activeAsset.id)}
                    />
                  </TabsContent>
                  <TabsContent
                    value="details"
                    className="mt-0 min-h-0 flex-1 overflow-y-auto"
                  >
                    <LibraryAssetDetails
                      asset={activeAsset}
                      selectionCount={selectionCount}
                      folderOptions={folderOptions}
                      shareCandidates={shareCandidates}
                      granteeIds={granteeIds}
                      moving={moving}
                      saving={saving}
                      deleting={deleting}
                      onGranteeIdsChange={setGranteeIds}
                      onMoveAsset={(folderId) => void moveActiveAsset(folderId)}
                      onSaveGrants={() => void saveGrants()}
                      onDeleteAsset={() => void deleteActiveAsset()}
                    />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
                Select a file from the list to open it here, or check several
                files and folders to move them together.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
