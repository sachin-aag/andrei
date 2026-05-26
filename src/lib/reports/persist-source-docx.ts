import { createHash } from "node:crypto";
import { db } from "@/db";
import { reportSourceDocx } from "@/db/schema";

export async function persistReportSourceDocx(args: {
  reportId: string;
  buffer: Buffer;
  filename: string;
  uploadedById: string;
}): Promise<void> {
  const sha256 = createHash("sha256").update(args.buffer).digest("hex");

  await db.insert(reportSourceDocx).values({
    reportId: args.reportId,
    filename: args.filename,
    sizeBytes: args.buffer.byteLength,
    sha256,
    data: args.buffer,
    uploadedById: args.uploadedById,
  });
}
