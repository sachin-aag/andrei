import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

const patchSchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  content: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { commentId } = await params;

  const parse = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [updated] = await db
    .update(comments)
    .set(parse.data)
    .where(eq(comments.id, commentId))
    .returning();

  return NextResponse.json({ comment: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { commentId } = await params;
  await db.delete(comments).where(eq(comments.id, commentId));
  return NextResponse.json({ ok: true });
}
