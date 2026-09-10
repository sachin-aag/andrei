import type {
  attachmentAssets,
  attachmentLibraryFolders,
  attachmentAccessGrants,
} from "@/db/schema";
import type { AttachmentProcessingStatus } from "@/db/schema";

type AssetRow = typeof attachmentAssets.$inferSelect;
type FolderRow = typeof attachmentLibraryFolders.$inferSelect;
type GrantRow = typeof attachmentAccessGrants.$inferSelect;

export type AttachmentLibraryFolderRecord = {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  archivedAt: string | null;
};

export type AttachmentLibraryAssetRecord = {
  id: string;
  ownerId: string;
  libraryFolderId: string | null;
  filename: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  processingStatus: AttachmentProcessingStatus;
  processingProgress: number;
  processingPage: number | null;
  processingError: string | null;
  uploadedAt: string;
  archivedAt: string | null;
  /** mine | shared | all — how the current user can see this asset. */
  accessKind: "mine" | "shared" | "all";
};

export type AttachmentAccessGrantRecord = {
  id: string;
  granteeUserId: string;
  grantedById: string;
  createdAt: string;
};

export function toLibraryFolderDto(row: FolderRow): AttachmentLibraryFolderRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    parentId: row.parentId,
    name: row.name,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    archivedAt:
      row.archivedAt == null
        ? null
        : row.archivedAt instanceof Date
          ? row.archivedAt.toISOString()
          : String(row.archivedAt),
  };
}

export function toLibraryAssetDto(
  row: AssetRow,
  accessKind: AttachmentLibraryAssetRecord["accessKind"]
): AttachmentLibraryAssetRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    libraryFolderId: row.libraryFolderId,
    filename: row.filename,
    description: row.description ?? null,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    processingStatus: row.processingStatus,
    processingProgress: row.processingProgress,
    processingPage: row.processingPage ?? null,
    processingError: row.processingError,
    uploadedAt:
      row.uploadedAt instanceof Date
        ? row.uploadedAt.toISOString()
        : String(row.uploadedAt),
    archivedAt:
      row.deletedAt == null
        ? null
        : row.deletedAt instanceof Date
          ? row.deletedAt.toISOString()
          : String(row.deletedAt),
    accessKind,
  };
}

export function toAccessGrantDto(row: GrantRow): AttachmentAccessGrantRecord {
  return {
    id: row.id,
    granteeUserId: row.granteeUserId,
    grantedById: row.grantedById,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
