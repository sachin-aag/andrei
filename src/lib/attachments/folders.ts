import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachmentFolders } from "@/db/schema";
import { toAttachmentFolderDto } from "@/lib/attachments/dto";
import {
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
} from "@/lib/attachments/folder-limits";
import type { ReportAttachmentFolderRecord } from "@/types/report";

export { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH };

type FolderRow = typeof reportAttachmentFolders.$inferSelect;

export async function listAttachmentFolders(
  reportId: string
): Promise<ReportAttachmentFolderRecord[]> {
  const rows = await db
    .select()
    .from(reportAttachmentFolders)
    .where(eq(reportAttachmentFolders.reportId, reportId))
    .orderBy(asc(reportAttachmentFolders.name));
  return rows.map(toAttachmentFolderDto);
}

export async function loadFolder(
  reportId: string,
  folderId: string
): Promise<FolderRow | undefined> {
  const [folder] = await db
    .select()
    .from(reportAttachmentFolders)
    .where(
      and(
        eq(reportAttachmentFolders.id, folderId),
        eq(reportAttachmentFolders.reportId, reportId)
      )
    );
  return folder;
}

/** Trims and collapses whitespace; returns null when the result is unusable. */
export function normalizeFolderName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_FOLDER_NAME_LENGTH) return null;
  if (name === "." || name === "..") return null;
  if (name.includes("/")) return null;
  return name;
}

type ValidationError = { error: string; status: number };

/**
 * Verifies a proposed parent exists in this report and that reparenting
 * `folderId` under it would not create a cycle or exceed the depth cap.
 * Pass `folderId: null` when validating placement of a new folder or a file.
 */
export async function validateFolderPlacement({
  reportId,
  parentId,
  folderId,
}: {
  reportId: string;
  parentId: string | null;
  folderId: string | null;
}): Promise<ValidationError | null> {
  if (parentId === null) return null;
  if (parentId === folderId) {
    return { error: "A folder cannot be moved into itself", status: 400 };
  }

  const rows = await db
    .select({
      id: reportAttachmentFolders.id,
      parentId: reportAttachmentFolders.parentId,
    })
    .from(reportAttachmentFolders)
    .where(eq(reportAttachmentFolders.reportId, reportId));

  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  if (!parentById.has(parentId)) {
    return { error: "Parent folder not found", status: 404 };
  }

  let depth = 1;
  let cursor: string | null = parentId;
  while (cursor !== null) {
    if (cursor === folderId) {
      return { error: "A folder cannot be moved into its own subtree", status: 400 };
    }
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH) {
      return {
        error: `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`,
        status: 400,
      };
    }
    cursor = parentById.get(cursor) ?? null;
  }

  return null;
}
