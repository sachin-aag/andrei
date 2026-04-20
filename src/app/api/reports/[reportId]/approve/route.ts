import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "manager") {
    return NextResponse.json({ error: "Only managers can approve" }, { status: 403 });
  }
  const { reportId } = await params;

  const [updated] = await db
    .update(reports)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(reports.id, reportId))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report: updated });
}
