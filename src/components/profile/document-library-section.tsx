"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Folder, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ManagerSelector } from "@/components/report/manager-selector";
import { LibraryAssetLabel } from "@/components/profile/library-asset-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";
import { formatLibraryUploadedAt } from "@/lib/attachments/library-display";
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
  focusedAssetId,
  checkedAssetIds,
  checkedFolderIds,
  onFocusAsset,
  onToggleAssetCheck,
  onToggleFolderCheck,
  onDeleteFolder,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  focusedAssetId: string | null;
  checkedAssetIds: Set<string>;
  checkedFolderIds: Set<string>;
  onFocusAsset: (assetId: string) => void;
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
              focusedAssetId={focusedAssetId}
              checkedAssetIds={checkedAssetIds}
              checkedFolderIds={checkedFolderIds}
              onFocusAsset={onFocusAsset}
              onToggleAssetCheck={onToggleAssetCheck}
              onToggleFolderCheck={onToggleFolderCheck}
              onDeleteFolder={onDeleteFolder}
            />
          </div>
        );
      })}
      {childAssets.map((asset) => {
        const checked = checkedAssetIds.has(asset.id);
        const focused = focusedAssetId === asset.id;
        return (
          <div
            key={asset.id}
            className={cn(
              "flex items-start gap-2 rounded-md py-1.5 pr-2 transition-colors",
              focused
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
            />
            <button
              type="button"
              onClick={() => onFocusAsset(asset.id)}
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

export function DocumentLibrarySection({ currentUser, workspaceUsers }: Props) {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusedAssetId, setFocusedAssetId] = useState<string | null>(null);
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

  const focusAsset = (assetId: string) => {
    setFocusedAssetId(assetId);
    void loadGrants(assetId);
  };

  const selectionCount = checkedAssetIds.size + checkedFolderIds.size;

  const saveGrants = async () => {
    if (!focusedAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${focusedAssetId}/access`,
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

  const moveFocusedAsset = async (libraryFolderId: string | null) => {
    if (!focusedAssetId) return;
    setMoving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${focusedAssetId}`,
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

  const deleteFocusedAsset = async () => {
    if (!focusedAssetId) return;
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
        `/api/attachment-library/${focusedAssetId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove file");
        return;
      }
      setFocusedAssetId(null);
      setGranteeIds([]);
      setCheckedAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(focusedAssetId);
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

  const focusedAsset = library?.assets.find((asset) => asset.id === focusedAssetId);
  const shareCandidates = workspaceUsers.filter(
    (user) => user.id !== currentUser.id
  );
  const folderOptions = library?.folders ?? [];

  const moveTargetOptions = folderOptions.filter(
    (folder) =>
      !checkedFolderIds.has(folder.id) &&
      !isFolderUnderAny(folder.id, checkedFolderIds, folderOptions)
  );

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <h2 className="text-base font-semibold">Document library</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Organize files into folders, share them with colleagues, or remove them
        from your library. Files already on reports stay there.
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
        <div className="mt-5 flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 lg:min-h-0">
            <div className="mb-2 flex items-center justify-between gap-2">
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

            <div className="max-h-[min(420px,50vh)] overflow-y-auto overscroll-contain rounded-md border border-[var(--border)] bg-[var(--background)] px-1 py-2">
              <LibraryProfileTree
                folderId={null}
                depth={0}
                foldersByParent={tree.foldersByParent}
                assetsByFolder={tree.assetsByFolder}
                focusedAssetId={focusedAssetId}
                checkedAssetIds={checkedAssetIds}
                checkedFolderIds={checkedFolderIds}
                onFocusAsset={focusAsset}
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

          <div className="min-w-0 w-full shrink-0 lg:w-72 lg:border-l lg:border-[var(--border)] lg:pl-6">
            {focusedAsset ? (
              <div className="space-y-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">
                    {focusedAsset.filename}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Uploaded {formatLibraryUploadedAt(focusedAsset.uploadedAt)}
                  </p>
                </div>

                {selectionCount <= 1 ? (
                  <div className="space-y-2">
                    <label
                      htmlFor="library-folder-move"
                      className="text-sm font-medium"
                    >
                      Folder
                    </label>
                    <select
                      id="library-folder-move"
                      disabled={moving}
                      value={focusedAsset.libraryFolderId ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        void moveFocusedAsset(value === "" ? null : value);
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
                    Use the move bar above the file list to relocate{" "}
                    {selectionCount} selected items.
                  </p>
                )}

                <div>
                  <h3 className="text-sm font-medium">Shared with</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Revoking access stops new reports from linking this file.
                    Existing report links stay in place.
                  </p>
                </div>
                <ManagerSelector
                  managers={shareCandidates}
                  selectedIds={granteeIds}
                  onSelectedIdsChange={setGranteeIds}
                  placeholder="Add colleagues…"
                  emptyMessage="No other workspace users are available."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveGrants()}
                    disabled={saving}
                    className="inline-flex items-center rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save sharing"}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleting}
                    onClick={() => void deleteFocusedAsset()}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    {deleting ? "Removing…" : "Remove from library"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Select a document to manage sharing, or check several files and
                folders to move them together.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
