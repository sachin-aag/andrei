import { createHash } from "node:crypto";
import { kindFromMime } from "@/lib/attachments/file-types";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { getMalwareScanner } from "@/lib/attachments/malware-scan";
import { validateDocx } from "@/lib/attachments/validate-docx";
import { validatePdf } from "@/lib/attachments/validate-pdf";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const SIZE_TOLERANCE_BYTES = 1024;

export type PromotedAttachmentBytes = {
  sha256: string;
  pageCount: number;
  generation: string;
  crc32c: string;
  sizeBytes: number;
};

export async function validateAndPromoteStagedAttachment(input: {
  stagingObjectKey: string;
  permanentObjectKey: string;
  reservedSizeBytes: number;
  mimeType: string;
  filename: string;
}): Promise<PromotedAttachmentBytes> {
  const storage = getAttachmentStorage();
  const limits = getAttachmentLimits();
  const stagingMetadata = await storage.getObjectMetadata(input.stagingObjectKey);
  if (
    Math.abs(stagingMetadata.sizeBytes - input.reservedSizeBytes) >
    SIZE_TOLERANCE_BYTES
  ) {
    throw new Error("Uploaded file size did not match reservation");
  }
  if (stagingMetadata.sizeBytes > limits.maxAttachmentBytes) {
    throw new Error("Uploaded file exceeds size limit");
  }
  const kind = kindFromMime(input.mimeType);
  if (!kind) {
    throw new Error("Unsupported attachment type");
  }
  if (kindFromMime(stagingMetadata.contentType) !== kind) {
    throw new Error("Uploaded object type does not match the reservation");
  }

  const buffer = await storage.readObjectBuffer(input.stagingObjectKey);
  const { pageCount } =
    kind === "docx"
      ? validateDocx(buffer)
      : await validatePdf(buffer, { maxPages: limits.maxAttachmentPages });
  const scanResult = await getMalwareScanner().scan(buffer, input.filename);
  if (!scanResult.ok) {
    throw new Error(scanResult.reason);
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  try {
    await storage.copyObject(input.stagingObjectKey, input.permanentObjectKey);
  } catch {
    await storage.getObjectMetadata(input.permanentObjectKey);
  }
  const permanentMetadata = await storage.getObjectMetadata(
    input.permanentObjectKey
  );

  return {
    sha256,
    pageCount,
    generation: permanentMetadata.generation,
    crc32c: permanentMetadata.crc32c,
    sizeBytes: permanentMetadata.sizeBytes,
  };
}

export function sanitizeFinalizeError(error: unknown): string {
  if (!(error instanceof Error)) return "Attachment validation failed";
  const message = error.message;
  if (message.includes("Malware scanning") || message.includes("Malware")) {
    return "Attachment malware scan failed";
  }
  if (message.includes("Document ingestion") || message.includes("ingest")) {
    return message.slice(0, 300);
  }
  if (
    message.includes("PDF") ||
    message.includes("Word") ||
    message.includes(".docx") ||
    message.includes("file") ||
    message.includes("object") ||
    message.includes("type")
  ) {
    return message;
  }
  return "Attachment validation failed";
}
