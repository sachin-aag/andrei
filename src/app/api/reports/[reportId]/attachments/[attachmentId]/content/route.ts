import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { requireReportAttachmentAccess } from "@/lib/attachments/route-helpers";
import { readObjectStream } from "@/lib/storage/gcs";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const { reportId, attachmentId } = await params;
  const access = await requireReportAttachmentAccess(reportId);
  if ("error" in access) return access.error;

  const [row] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId)
      )
    );

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const stream = readObjectStream(row.gcsObjectKey);
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to read attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
