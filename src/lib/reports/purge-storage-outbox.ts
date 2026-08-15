import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storageOutbox } from "@/db/schema";
import {
  getAttachmentStorage,
  getAttachmentStorageBucketName,
} from "@/lib/storage/attachments";

export type AttachmentPurgeSource = {
  id: string;
  stagingObjectKey: string;
  permanentObjectKey: string;
  gcsGeneration: string | null;
};

export type AttachmentPurgeObject = {
  bucket: string;
  objectKey: string;
  gcsGeneration: string | null;
  attachmentId: string;
};

export function collectAttachmentPurgeObjects(
  attachments: AttachmentPurgeSource[],
  bucket = getAttachmentStorageBucketName()
): AttachmentPurgeObject[] {
  const byObject = new Map<string, AttachmentPurgeObject>();

  for (const attachment of attachments) {
    const objects = [
      {
        objectKey: attachment.permanentObjectKey,
        gcsGeneration: attachment.gcsGeneration,
      },
      {
        objectKey: attachment.stagingObjectKey,
        gcsGeneration: null,
      },
    ];

    for (const object of objects) {
      if (!object.objectKey) continue;
      const key = `${bucket}\0${object.objectKey}\0${object.gcsGeneration ?? ""}`;
      if (!byObject.has(key)) {
        byObject.set(key, {
          bucket,
          objectKey: object.objectKey,
          gcsGeneration: object.gcsGeneration,
          attachmentId: attachment.id,
        });
      }
    }
  }

  return [...byObject.values()];
}

export async function processPurgeStorageOutboxRows(
  rows: Array<typeof storageOutbox.$inferSelect>
): Promise<{ done: number; failed: number }> {
  const storage = getAttachmentStorage();
  let done = 0;
  let failed = 0;

  for (const row of rows) {
    await db
      .update(storageOutbox)
      .set({
        status: "processing",
        attempts: row.attempts + 1,
        lastError: null,
      })
      .where(eq(storageOutbox.id, row.id));

    try {
      await storage.deleteObject(row.objectKey);
      await db
        .update(storageOutbox)
        .set({
          status: "done",
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(storageOutbox.id, row.id));
      done += 1;
    } catch (error) {
      await db
        .update(storageOutbox)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(storageOutbox.id, row.id));
      failed += 1;
    }
  }

  return { done, failed };
}
