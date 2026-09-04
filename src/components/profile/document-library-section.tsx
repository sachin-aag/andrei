"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Folder, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ManagerSelector } from "@/components/report/manager-selector";
import { LibraryAssetLabel } from "@/components/profile/library-asset-label";
import { Button } from "@/components/ui/button";
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

function LibraryProfileTree({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  selectedAssetId,
  onSelectAsset,
  onDeleteFolder,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];

  return (
    <div className="space-y-0.5">
      {childFolders.map((folder) => (
        <div key={folder.id}>
          <div
            className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--secondary)]/50"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
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
              className="rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--secondary)] hover:text-[var(--destructive)] group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <LibraryProfileTree
            folderId={folder.id}
            depth={depth + 1}
            foldersByParent={foldersByParent}
            assetsByFolder={assetsByFolder}
            selectedAssetId={selectedAssetId}
            onSelectAsset={onSelectAsset}
            onDeleteFolder={onDeleteFolder}
          />
        </div>
      ))}
      {childAssets.map((asset) => {
        const selected = selectedAssetId === asset.id;
        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelectAsset(asset.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
              selected
                ? "bg-[var(--secondary)] text-[var(--foreground)]"
                : "hover:bg-[var(--secondary)]/50"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <LibraryAssetLabel
              filename={asset.filename}
              uploadedAt={asset.uploadedAt}
              processingStatus={asset.processingStatus}
            />
          </button>
        );
      })}
    </div>
  );
}

export function DocumentLibrarySection({ currentUser, workspaceUsers }: Props) {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [granteeIds, setGranteeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
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

  const selectAsset = (assetId: string) => {
    setSelectedAssetId(assetId);
    void loadGrants(assetId);
  };

  const saveGrants = async () => {
    if (!selectedAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${selectedAssetId}/access`,
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
    await loadLibrary();
  };

  const moveSelectedAsset = async (libraryFolderId: string | null) => {
    if (!selectedAssetId) return;
    setMoving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${selectedAssetId}`,
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

  const deleteSelectedAsset = async () => {
    if (!selectedAssetId) return;
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
        `/api/attachment-library/${selectedAssetId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove file");
        return;
      }
      setSelectedAssetId(null);
      setGranteeIds([]);
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

  const selectedAsset = library?.assets.find((asset) => asset.id === selectedAssetId);
  const shareCandidates = workspaceUsers.filter(
    (user) => user.id !== currentUser.id
  );

  const folderOptions = library?.folders ?? [];

  function folderLabel(folder: AttachmentLibraryFolderRecord): string {
    const parts = [folder.name];
    let parentId = folder.parentId;
    while (parentId) {
      const parent = folderOptions.find((item) => item.id === parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parentId;
    }
    return parts.join(" / ");
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
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
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Your files
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
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
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              />
            ) : null}

            <div className="max-h-[min(420px,50vh)] min-h-[200px] overflow-y-auto rounded-md border border-[var(--border)] p-2">
              <LibraryProfileTree
                folderId={null}
                depth={0}
                foldersByParent={tree.foldersByParent}
                assetsByFolder={tree.assetsByFolder}
                selectedAssetId={selectedAssetId}
                onSelectAsset={selectAsset}
                onDeleteFolder={(folderId) => void deleteFolder(folderId)}
              />
            </div>
          </div>

          <div className="min-h-0">
            {selectedAsset ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">{selectedAsset.filename}</h3>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Uploaded {formatLibraryUploadedAt(selectedAsset.uploadedAt)}
                  </p>
                </div>

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
                    value={selectedAsset.libraryFolderId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      void moveSelectedAsset(value === "" ? null : value);
                    }}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  >
                    <option value="">Top level</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>

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
                    onClick={() => void deleteSelectedAsset()}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    {deleting ? "Removing…" : "Remove from library"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Select a document to organize, share, or remove it from your
                library.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
