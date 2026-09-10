"use client";

import { Archive, ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isVaultAssetChecked } from "@/lib/attachments/add-from-vault-selection";
import {
  formatVaultByteSize,
  formatLibraryUploadedAt,
  vaultItemKindLabel,
} from "@/lib/attachments/library-display";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";
import { cn } from "@/lib/utils";

const COLUMNS =
  "minmax(0,1fr) 9.5rem 4.75rem 7.75rem" as const;

export function VaultExplorerList({
  folderId,
  depth,
  foldersByParent,
  assetsByFolder,
  inspectedAssetId,
  checkedAssetIds,
  checkedFolderIds,
  excludedAssetIds,
  parentById,
  collapsedFolderIds,
  query,
  onInspectAsset,
  onOpenAsset,
  onToggleAssetCheck,
  onToggleFolderCheck,
  onToggleFolderCollapsed,
  onArchiveFolder,
  onArchiveAsset,
  onDropOnFolder,
  showHeader = false,
}: {
  folderId: string | null;
  depth: number;
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
  inspectedAssetId: string | null;
  checkedAssetIds: Set<string>;
  checkedFolderIds: Set<string>;
  excludedAssetIds: Set<string>;
  parentById: Map<string, string | null>;
  collapsedFolderIds: Set<string>;
  query: string;
  onInspectAsset: (assetId: string) => void;
  onOpenAsset: (assetId: string) => void;
  onToggleAssetCheck: (
    asset: AttachmentLibraryAssetRecord,
    checked: boolean
  ) => void;
  onToggleFolderCheck: (folderId: string, checked: boolean) => void;
  onToggleFolderCollapsed: (folderId: string) => void;
  onArchiveFolder: (folderId: string) => void;
  onArchiveAsset: (assetId: string) => void;
  onDropOnFolder: (folderId: string | null, dataTransfer: DataTransfer) => void;
  showHeader?: boolean;
}) {
  const childFolders = foldersByParent.get(folderId) ?? [];
  const childAssets = assetsByFolder.get(folderId) ?? [];
  const needle = query.trim().toLowerCase();

  const visibleFolders = childFolders.filter(
    (folder) =>
      !needle ||
      folder.name.toLowerCase().includes(needle) ||
      subtreeHasMatch(folder.id, needle, foldersByParent, assetsByFolder)
  );
  const visibleAssets = childAssets.filter((asset) =>
    !needle || asset.filename.toLowerCase().includes(needle)
  );

  return (
    <div>
      {showHeader ? (
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
          style={{ gridTemplateColumns: COLUMNS }}
        >
          <span className="pl-1">Name</span>
          <span className="hidden sm:block">Date modified</span>
          <span className="hidden md:block">Size</span>
          <span className="hidden md:block">Kind</span>
        </div>
      ) : null}
      {visibleFolders.map((folder) => {
        const collapsed =
          needle.length === 0 && collapsedFolderIds.has(folder.id);
        const checked = checkedFolderIds.has(folder.id);
        const indent = depth * 16;
        return (
          <div key={folder.id}>
            <div
              className={cn(
                "group grid items-center gap-2 border-b border-[var(--border)]/60 px-2 py-[5px] hover:bg-[var(--secondary)]/50",
                checked && "bg-[var(--secondary)]/40"
              )}
              style={{ gridTemplateColumns: COLUMNS }}
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
              <div
                className="flex min-w-0 items-center gap-1"
                style={{ paddingLeft: `${indent}px` }}
              >
                <button
                  type="button"
                  aria-label={
                    collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`
                  }
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
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <Folder
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {folder.name}
                  </span>
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
              <span className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block">
                {formatLibraryUploadedAt(folder.createdAt)}
              </span>
              <span className="hidden text-xs text-[var(--muted-foreground)] md:block">
                —
              </span>
              <span className="hidden truncate text-xs text-[var(--muted-foreground)] md:block">
                {vaultItemKindLabel({ isFolder: true })}
              </span>
            </div>
            {collapsed ? null : (
              <VaultExplorerList
                folderId={folder.id}
                depth={depth + 1}
                foldersByParent={foldersByParent}
                assetsByFolder={assetsByFolder}
                inspectedAssetId={inspectedAssetId}
                checkedAssetIds={checkedAssetIds}
                checkedFolderIds={checkedFolderIds}
                excludedAssetIds={excludedAssetIds}
                parentById={parentById}
                collapsedFolderIds={collapsedFolderIds}
                query={query}
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
      {visibleAssets.map((asset) => {
        const checked = isVaultAssetChecked(
          asset,
          checkedFolderIds,
          checkedAssetIds,
          excludedAssetIds,
          parentById
        );
        const inspected = inspectedAssetId === asset.id;
        const indent = depth * 16;
        return (
          <div
            key={asset.id}
            className={cn(
              "group grid items-center gap-2 border-b border-[var(--border)]/60 px-2 py-[5px] hover:bg-[var(--secondary)]/50",
              inspected
                ? "bg-[var(--secondary)]"
                : checked
                  ? "bg-[var(--secondary)]/40"
                  : null
            )}
            style={{ gridTemplateColumns: COLUMNS }}
          >
            <div
              className="flex min-w-0 items-center gap-1"
              style={{ paddingLeft: `${indent + 20}px` }}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggleAssetCheck(asset, value === true)
                }
                aria-label={`Select ${asset.filename}`}
                onClick={(event) => event.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => onInspectAsset(asset.id)}
                onDoubleClick={() => onOpenAsset(asset.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                data-testid={`library-file-${asset.id}`}
              >
                <FileText
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {asset.filename}
                </span>
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
            <span className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block">
              {formatLibraryUploadedAt(asset.uploadedAt)}
            </span>
            <span className="hidden truncate text-xs tabular-nums text-[var(--muted-foreground)] md:block">
              {formatVaultByteSize(asset.sizeBytes)}
            </span>
            <span className="hidden truncate text-xs text-[var(--muted-foreground)] md:block">
              {vaultItemKindLabel({
                isFolder: false,
                mimeType: asset.mimeType,
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function subtreeHasMatch(
  folderId: string,
  needle: string,
  foldersByParent: Map<string | null, AttachmentLibraryFolderRecord[]>,
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>
): boolean {
  for (const asset of assetsByFolder.get(folderId) ?? []) {
    if (asset.filename.toLowerCase().includes(needle)) return true;
  }
  for (const child of foldersByParent.get(folderId) ?? []) {
    if (child.name.toLowerCase().includes(needle)) return true;
    if (subtreeHasMatch(child.id, needle, foldersByParent, assetsByFolder)) {
      return true;
    }
  }
  return false;
}
