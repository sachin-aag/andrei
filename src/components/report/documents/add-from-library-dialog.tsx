"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, Loader2 } from "lucide-react";
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
  omitLinkedVaultAssets,
  toggleVaultAssetSelection,
  toggleVaultFolderSelection,
} from "@/lib/attachments/add-from-vault-selection";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";

type LibraryScope = "mine" | "shared" | "all";

const EMPTY_LINKED_ASSET_IDS: ReadonlySet<string> = new Set();

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
  /** Vault asset ids already linked to this report — hidden from the picker. */
  linkedAssetIds?: ReadonlySet<string>;
};

function LibraryTreeNode({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  parentById,
  selectedAssetIds,
  selectedFolderIds,
  excludedAssetIds,
  collapsedFolderIds,
  onToggleAsset,
  onToggleFolder,
  onToggleFolderCollapsed,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  parentById: Map<string, string | null>;
  selectedAssetIds: Set<string>;
  selectedFolderIds: Set<string>;
  excludedAssetIds: Set<string>;
  collapsedFolderIds: Set<string>;
  onToggleAsset: (asset: AttachmentLibraryAssetRecord, checked: boolean) => void;
  onToggleFolder: (id: string, checked: boolean) => void;
  onToggleFolderCollapsed: (id: string) => void;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];
  const indent = depth * 12 + 8;

  return (
    <div className="space-y-1">
      {childFolders.map((folder) => {
        const checked = selectedFolderIds.has(folder.id);
        const collapsed = collapsedFolderIds.has(folder.id);
        const hasChildren =
          (foldersByParent.get(folder.id)?.length ?? 0) > 0 ||
          (assetsByFolder.get(folder.id)?.length ?? 0) > 0;
        return (
          <div key={folder.id}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-md py-1.5 pr-2 text-sm hover:bg-[var(--secondary)]/60",
                checked && "bg-[var(--secondary)]"
              )}
              style={{ paddingLeft: `${indent}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={
                    collapsed
                      ? `Expand ${folder.name}`
                      : `Collapse ${folder.name}`
                  }
                  aria-expanded={!collapsed}
                  onClick={() => onToggleFolderCollapsed(folder.id)}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                >
                  {collapsed ? (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span className="size-5 shrink-0" aria-hidden="true" />
              )}
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggleFolder(folder.id, value === true)
                }
                aria-label={`Select folder ${folder.name}`}
              />
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggleFolderCollapsed(folder.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Folder
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                  <span className="truncate">{folder.name}</span>
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Folder
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                  <span className="truncate">{folder.name}</span>
                </span>
              )}
            </div>
            {collapsed ? null : (
              <LibraryTreeNode
                folderId={folder.id}
                depth={depth + 1}
                foldersByParent={foldersByParent}
                assetsByFolder={assetsByFolder}
                parentById={parentById}
                selectedAssetIds={selectedAssetIds}
                selectedFolderIds={selectedFolderIds}
                excludedAssetIds={excludedAssetIds}
                collapsedFolderIds={collapsedFolderIds}
                onToggleAsset={onToggleAsset}
                onToggleFolder={onToggleFolder}
                onToggleFolderCollapsed={onToggleFolderCollapsed}
              />
            )}
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
              "flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-[var(--secondary)]/60",
              checked && "bg-[var(--secondary)]"
            )}
            style={{ paddingLeft: `${indent + 20}px` }}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => onToggleAsset(asset, value === true)}
              aria-label={`Select ${asset.filename}`}
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
  linkedAssetIds,
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
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set()
  );

  const linkedIds = linkedAssetIds ?? EMPTY_LINKED_ASSET_IDS;

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
    setCollapsedFolderIds(new Set());
    setLoading(true);
    void loadLibrary(scope);
  }, [open, scope, loadLibrary]);

  const visible = useMemo(() => {
    if (!library) {
      return { folders: [] as AttachmentLibraryFolderRecord[], assets: [] };
    }
    return omitLinkedVaultAssets(library.folders, library.assets, linkedIds);
  }, [library, linkedIds]);

  const tree = useMemo(
    () => buildVaultTree(visible.folders, visible.assets),
    [visible]
  );

  const selectionCount = useMemo(() => {
    return countVaultLinkSelection(
      visible.folders,
      visible.assets,
      selectedFolderIds,
      selectedAssetIds,
      excludedAssetIds
    );
  }, [visible, selectedFolderIds, selectedAssetIds, excludedAssetIds]);

  const handleLink = async () => {
    if (!library || selectionCount === 0) return;
    const payload = buildVaultLinkPayload(
      visible.folders,
      visible.assets,
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

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const emptyMessage =
    library && library.assets.length > 0 && visible.assets.length === 0
      ? "All documents in this vault view are already on this report."
      : "No documents in this vault view yet.";

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
      <DialogContent
        className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        data-testid="add-from-vault-dialog"
      >
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
          ) : visible.assets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--muted-foreground)]">
              {emptyMessage}
            </p>
          ) : (
            <LibraryTreeNode
              folderId={null}
              depth={0}
              foldersByParent={tree.foldersByParent}
              assetsByFolder={tree.assetsByFolder}
              parentById={tree.parentById}
              selectedAssetIds={selectedAssetIds}
              selectedFolderIds={selectedFolderIds}
              excludedAssetIds={excludedAssetIds}
              collapsedFolderIds={collapsedFolderIds}
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
                  visible.folders,
                  visible.assets,
                  nextSelectedFolders,
                  nextSelectedAssets,
                  nextExcludedAssets
                );
                setSelectedFolderIds(nextSelectedFolders);
                setSelectedAssetIds(nextSelectedAssets);
                setExcludedAssetIds(nextExcludedAssets);
              }}
              onToggleFolderCollapsed={toggleFolderCollapsed}
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
