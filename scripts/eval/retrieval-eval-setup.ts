import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments, reports, workspaceUsers } from "@/db/schema";
import { runDocumentIngest } from "@/lib/attachments/run-document-ingest";
import {
  getAttachmentStorage,
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";
import { assertCorpusAnchors, type CorpusFile } from "./retrieval-corpus";

const EVAL_USER_EMAIL = "retrieval-eval@andrei.local";
const EVAL_DOCUMENT_NO_PREFIX = "RETRIEVAL-EVAL";

async function ensureEvalUser(): Promise<string> {
  const [existing] = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, EVAL_USER_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  const id = createId();
  await db.insert(workspaceUsers).values({
    id,
    name: "Retrieval Eval",
    email: EVAL_USER_EMAIL,
    role: "engineer",
    title: "Engineer",
    passwordHash: null,
    mustChangePassword: false,
  });
  return id;
}

async function ingestOneFile(input: {
  reportId: string;
  uploadedById: string;
  filename: string;
  bytes: Buffer;
}): Promise<void> {
  const attachmentId = createId();
  const stagingKey = stagingObjectKey(attachmentId);
  const permanentKey = permanentObjectKey(input.reportId, attachmentId);
  const storage = getAttachmentStorage();
  await storage.writeObjectBuffer(permanentKey, input.bytes, "application/pdf");
  const metadata = await storage.getObjectMetadata(permanentKey);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  await db.insert(reportAttachments).values({
    id: attachmentId,
    reportId: input.reportId,
    filename: input.filename,
    mimeType: "application/pdf",
    sizeBytes: input.bytes.byteLength,
    sha256,
    stagingObjectKey: stagingKey,
    permanentObjectKey: permanentKey,
    gcsGeneration: metadata.generation,
    crc32c: metadata.crc32c,
    processingStatus: "queued",
    uploadedById: input.uploadedById,
  });

  const outcome = await runDocumentIngest(attachmentId, metadata.generation);
  if (outcome !== "done") {
    throw new Error(
      `Ingest of ${input.filename} did not finish (outcome=${outcome})`
    );
  }
}

/**
 * Create a fresh report, write corpus PDFs into local attachment storage,
 * and run real Vertex ingest so search can run against pgvector.
 */
export async function ingestCorpusIntoNewReport(
  files: readonly CorpusFile[]
): Promise<string> {
  if (files.length === 0) {
    throw new Error("retrieval eval corpus is empty");
  }
  await assertCorpusAnchors(files);
  const authorId = await ensureEvalUser();
  const documentNo = `${EVAL_DOCUMENT_NO_PREFIX}-${Date.now()}`;
  const [report] = await db
    .insert(reports)
    .values({
      documentType: "design_verification",
      documentNo,
      authorId,
      status: "draft",
      metadata: { revision: "A", productName: "Retrieval eval corpus" },
    })
    .returning({ id: reports.id });
  if (!report) {
    throw new Error("Failed to insert retrieval eval report");
  }

  for (const file of files) {
    console.log(`ingest ${file.filename} (${file.bytes.byteLength} bytes)`);
    await ingestOneFile({
      reportId: report.id,
      uploadedById: authorId,
      filename: file.filename,
      bytes: file.bytes,
    });
  }
  return report.id;
}
