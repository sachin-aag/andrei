"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { LibraryAssetLabel } from "@/components/profile/library-asset-label";
import {
  buildVaultLinkPayload,
  buildVaultTree,
  countVaultLinkSelection,
  isVaultAssetChecked,
  toggleVaultAssetSelection,
  toggleVaultFolderSelection,
} from "@/lib/attachments/add-from-vault-selection";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";

type LibraryScope = "mine" | "shared" | "all";

type LibraryResponse = {
  scope: LibraryScope;
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (selection: {
    assetIds: string[];
    libraryFolderIds: string[];
    excludedAssetIds: string[];
  }) => Promise<void>;
  isAdmin?: boolean;
};

function LibraryTreeNode({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  parentById,
  folders,
  assets,
  selectedAssetIds,
  selectedFolderIds,
  excludedAssetIds,
  onToggleAsset,
  onToggleFolder,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  parentById: Map<string, string | null>;
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
  selectedAssetIds: Set<string>;
  selectedFolderIds: Set<string>;
  excludedAssetIds: Set<string>;
  onToggleAsset: (asset: AttachmentLibraryAssetRecord, checked: boolean) => void;
  onToggleFolder: (id: string, checked: boolean) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];

  return (
    <div className="space-y-1">
      {childFolders.map((folder) => {
        const checked = selectedFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <label
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--secondary)]/60",
                checked && "bg-[var(--secondary)]"
              )}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggleFolder(folder.id, value === true)
                }
              />
              <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" />
              <span className="truncate">{folder.name}</span>
            </label>
            <LibraryTreeNode
              folderId={folder.id}
              depth={depth + 1}
              foldersByParent={foldersByParent}
              assetsByFolder={assetsByFolder}
              parentById={parentById}
              folders={folders}
              assets={assets}
              selectedAssetIds={selectedAssetIds}
              selectedFolderIds={selectedFolderIds}
              excludedAssetIds={excludedAssetIds}
              onToggleAsset={onToggleAsset}
              onToggleFolder={onToggleFolder}
            />
          </div>
        );
      })}
      {childAssets.map((asset) => {
        const checked = isVaultAssetChecked(
          asset,
          selectedFolderIds,
          selectedAssetIds,
          excludedAssetIds,
          parentById
        );
        return (
          <label
            key={asset.id}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--secondary)]/60",
              checked && "bg-[var(--secondary)]"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => onToggleAsset(asset, value === true)}
            />
            <LibraryAssetLabel
              filename={asset.filename}
              uploadedAt={asset.uploadedAt}
              processingStatus={asset.processingStatus}
            />
          </label>
        );
      })}
    </div>
  );
}

export function AddFromLibraryDialog({
  open,
  onOpenChange,
  onLink,
  isAdmin = false,
}: Props) {
  const [scope, setScope] = useState<LibraryScope>("mine");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [excludedAssetIds, setExcludedAssetIds] = useState<Set<string>>(
    () => new Set()
  );

  const loadLibrary = useCallback(async (nextScope: LibraryScope) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/attachment-vault?scope=${encodeURIComponent(nextScope)}`
      );
      const data = (await response.json().catch(() => ({}))) as LibraryResponse & {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not load document vault");
        return;
      }
      setLibrary(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedAssetIds(new Set());
    setSelectedFolderIds(new Set());
    setExcludedAssetIds(new Set());
    void loadLibrary(scope);
  }, [open, scope, loadLibrary]);

  const tree = useMemo(() => {
    if (!library) {
      return buildVaultTree([], []);
    }
    return buildVaultTree(library.folders, library.assets);
  }, [library]);

  const selectionCount = useMemo(() => {
    if (!library) return 0;
    return countVaultLinkSelection(
      library.folders,
      library.assets,
      selectedFolderIds,
      selectedAssetIds,
      excludedAssetIds
    );
  }, [library, selectedFolderIds, selectedAssetIds, excludedAssetIds]);

  const handleLink = async () => {
    if (!library || selectionCount === 0) return;
    const payload = buildVaultLinkPayload(
      library.folders,
      library.assets,
      selectedFolderIds,
      selectedAssetIds,
      excludedAssetIds
    );
    setLinking(true);
    try {
      await onLink(payload);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add from vault"
      );
    } finally {
      setLinking(false);
    }
  };

  const scopeTabs: { value: LibraryScope; label: string }[] = isAdmin
    ? [
        { value: "mine", label: "My uploads" },
        { value: "shared", label: "Shared with me" },
        { value: "all", label: "All workspace" },
      ]
    : [
        { value: "mine", label: "My uploads" },
        { value: "shared", label: "Shared with me" },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 px-6 pt-6">
          <DialogTitle>Add from vault</DialogTitle>
          <DialogDescription>
            Reuse documents you have uploaded or that were shared with you.
            Selecting a folder includes its subfolders; uncheck individual files
            to leave them out. Processing runs once per file.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 flex flex-wrap gap-1 px-6 pt-3">
          {scopeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setScope(tab.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                scope === tab.value
                  ? "border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-y border-[var(--border)] px-2 py-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-[var(--muted-foreground)]">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : library && library.assets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--muted-foreground)]">
              No documents in this vault view yet.
            </p>
          ) : (
            <LibraryTreeNode
              folderId={null}
              depth={0}
              foldersByParent={tree.foldersByParent}
              assetsByFolder={tree.assetsByFolder}
              parentById={tree.parentById}
              folders={library?.folders ?? []}
              assets={library?.assets ?? []}
              selectedAssetIds={selectedAssetIds}
              selectedFolderIds={selectedFolderIds}
              excludedAssetIds={excludedAssetIds}
              onToggleAsset={(asset, checked) => {
                const nextSelectedAssets = new Set(selectedAssetIds);
                const nextExcludedAssets = new Set(excludedAssetIds);
                toggleVaultAssetSelection(
                  asset,
                  checked,
                  selectedFolderIds,
                  nextSelectedAssets,
                  nextExcludedAssets,
                  tree.parentById
                );
                setSelectedAssetIds(nextSelectedAssets);
                setExcludedAssetIds(nextExcludedAssets);
              }}
              onToggleFolder={(id, checked) => {
                const nextSelectedFolders = new Set(selectedFolderIds);
                const nextSelectedAssets = new Set(selectedAssetIds);
                const nextExcludedAssets = new Set(excludedAssetIds);
                toggleVaultFolderSelection(
                  id,
                  checked,
                  library?.folders ?? [],
                  library?.assets ?? [],
                  nextSelectedFolders,
                  nextSelectedAssets,
                  nextExcludedAssets
                );
                setSelectedFolderIds(nextSelectedFolders);
                setSelectedAssetIds(nextSelectedAssets);
                setExcludedAssetIds(nextExcludedAssets);
              }}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={linking}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleLink()}
            disabled={linking || selectionCount === 0}
          >
            {linking ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Adding…
              </>
            ) : (
              `Add ${selectionCount > 0 ? selectionCount : ""} to report`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
