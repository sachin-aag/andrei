import { NextResponse } from "next/server";
import { z } from "zod";
import { browserOriginFromRequest } from "@/lib/attachments/browser-origin";
import {
  canonicalAttachmentMime,
  resolveAttachmentKind,
} from "@/lib/attachments/file-types";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
  ensureLibraryFolderPath,
  loadLibraryFolder,
} from "@/lib/attachments/library-folders";
import { directorySegmentsFromRelativePath } from "@/lib/attachments/library-relative-path";
import { reserveLibraryUpload } from "@/lib/attachments/reserve-upload";
import {
  AttachmentStorageBudgetExceededError,
  attachmentStorageBudgetExceededResponse,
} from "@/lib/attachments/storage-budget";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import { getCurrentUser } from "@/lib/auth/session";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  libraryFolderId: z.string().min(1).nullable().optional(),
  relativePath: z.string().max(1024).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { filename, mimeType, sizeBytes, relativePath } = parsed.data;
  const dropFolderId = parsed.data.libraryFolderId ?? null;
  const kind = resolveAttachmentKind({ filename, mimeType });
  if (!kind) {
    return NextResponse.json(
      { error: "Only PDF and Word (.docx) files are allowed" },
      { status: 400 }
    );
  }
  const canonicalMime =
    canonicalAttachmentMime({ filename, mimeType }) ?? mimeType;

  const limits = getAttachmentLimits();
  if (sizeBytes > limits.maxAttachmentBytes) {
    return NextResponse.json(
      { error: `File exceeds ${limits.maxAttachmentBytes} byte limit` },
      { status: 400 }
    );
  }

  if (dropFolderId) {
    const folder = await loadLibraryFolder(user.id, dropFolderId);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  const pathResult = await ensureLibraryFolderPath({
    ownerId: user.id,
    parentId: dropFolderId,
    segments: directorySegmentsFromRelativePath(relativePath, filename),
  });
  if (!pathResult.ok) {
    return NextResponse.json(
      { error: pathResult.error },
      { status: pathResult.status }
    );
  }

  try {
    const reserved = await reserveLibraryUpload({
      ownerId: user.id,
      filename,
      mimeType: canonicalMime,
      sizeBytes,
      libraryFolderId: pathResult.folderId,
    });
    if (!reserved.ok) {
      if (reserved.status === 429) {
        return NextResponse.json(
          { error: reserved.error, code: "attachment_storage_budget_exceeded" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: reserved.error },
        { status: reserved.status }
      );
    }

    try {
      const uploadUrl = await getAttachmentStorage().createResumableUpload({
        objectKey: reserved.stagingObjectKey,
        contentType: canonicalMime,
        sizeBytes,
        origin: browserOriginFromRequest(req),
      });
      return NextResponse.json({
        assetId: reserved.assetId,
        uploadUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create upload URL";
      await syncAssetProcessing(reserved.assetId, {
        processingStatus: "failed",
        processingProgress: 0,
        processingError: message,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof AttachmentStorageBudgetExceededError) {
      return attachmentStorageBudgetExceededResponse(error);
    }
    throw error;
  }
}
