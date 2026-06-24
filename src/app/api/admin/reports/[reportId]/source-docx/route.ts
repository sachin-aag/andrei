import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportSourceDocx } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportId } = await params;
  const [row] = await db
    .select()
    .from(reportSourceDocx)
    .where(eq(reportSourceDocx.reportId, reportId));

  if (!row) {
    return NextResponse.json({ error: "No source DOCX stored for this report." }, { status: 404 });
  }

  const body = row.data instanceof Buffer ? row.data : Buffer.from(row.data);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `attachment; filename="${row.filename}"`,
    },
  });
}
