import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

const patchSchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  content: z.string().optional(),
});

function canResolveThread(user: { id: string; role: string }, report: { authorId: string }) {
  if (user.role === "manager") return true;
  return user.id === report.authorId;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ reportId: string; commentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId, commentId } = await params;

  const parse = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.reportId, reportId)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parse.data.status != null && !canResolveThread(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let threadRootId = commentId;
  if (row.parentId) {
    let node = row;
    while (node.parentId) {
      const [up] = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, node.parentId), eq(comments.reportId, reportId)));
      if (!up) break;
      node = up;
    }
    threadRootId = node.id;
  }

  if (parse.data.content != null) {
    const [updated] = await db
      .update(comments)
      .set({ content: parse.data.content })
      .where(and(eq(comments.id, commentId), eq(comments.reportId, reportId)))
      .returning();
    if (parse.data.status == null) {
      return NextResponse.json({ comment: updated });
    }
  }

  if (parse.data.status != null) {
    const [updated] = await db
      .update(comments)
      .set({ status: parse.data.status })
      .where(and(eq(comments.id, threadRootId), eq(comments.reportId, reportId)))
      .returning();
    return NextResponse.json({ comment: updated });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; commentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId, commentId } = await params;

  const [row] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.reportId, reportId)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.authorId !== user.id && user.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.reportId, reportId)));
  return NextResponse.json({ ok: true });
}
