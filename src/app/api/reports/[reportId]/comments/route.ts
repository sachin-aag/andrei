import { NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, reports, sectionTypeEnum } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

function canAccessReport(user: { id: string; role: string }, report: { authorId: string; assignedManagerId: string | null }) {
  if (user.role === "manager") return true;
  return user.id === report.authorId;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  // Dismissed comments are kept in the DB for audit / undo but excluded from
  // the UI by default. Pass ?include=dismissed when you genuinely need them.
  const url = new URL(req.url);
  const includeDismissed = url.searchParams.get("include") === "dismissed";

  const where = includeDismissed
    ? eq(comments.reportId, reportId)
    : and(eq(comments.reportId, reportId), ne(comments.status, "dismissed"));

  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows });
}

const sectionValues = sectionTypeEnum.enumValues;
const COMMENT_MAX_LENGTH = 1024;
const REPLY_MAX_LENGTH = 512;

const createSchema = z.object({
  content: z.string().min(1),
  parentId: z.string().optional().nullable(),
  anchorText: z.string().optional().default(""),
  sectionId: z.string().optional(),
  section: z.enum(sectionValues).optional(),
  contentPath: z.string().optional().nullable(),
  fromPos: z.number().int().optional().nullable(),
  toPos: z.number().int().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessReport(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parse = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const requestedParentId = parse.data.parentId ?? null;
  /** Thread root (flat replies all point at root id). */
  let threadRoot: (typeof comments.$inferSelect) | undefined;

  if (requestedParentId) {
    const [p] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, requestedParentId), eq(comments.reportId, reportId)));
    if (!p) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 400 });
    }
    let node = p;
    while (node.parentId) {
      const [up] = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, node.parentId), eq(comments.reportId, reportId)));
      if (!up) break;
      node = up;
    }
    threadRoot = node;
  } else if (user.role !== "manager" && user.id !== report.authorId) {
    return NextResponse.json(
      { error: "Only reviewers or the report author can start a new comment thread" },
      { status: 403 }
    );
  }

  const parentIdForInsert = threadRoot ? threadRoot.id : null;

  const maxLen = parentIdForInsert ? REPLY_MAX_LENGTH : COMMENT_MAX_LENGTH;
  if (parse.data.content.length > maxLen) {
    return NextResponse.json(
      { error: `Content exceeds ${maxLen} character limit` },
      { status: 400 }
    );
  }

  const [inserted] = await db
    .insert(comments)
    .values({
      reportId,
      parentId: parentIdForInsert,
      sectionId: threadRoot
        ? threadRoot.sectionId
        : parse.data.sectionId ?? null,
      section: threadRoot
        ? threadRoot.section
        : ((parse.data.section as SectionType | undefined) ?? null),
      authorId: user.id,
      content: parse.data.content,
      anchorText: threadRoot ? "" : parse.data.anchorText ?? "",
      contentPath: threadRoot ? threadRoot.contentPath : parse.data.contentPath ?? null,
      fromPos: threadRoot ? null : parse.data.fromPos ?? null,
      toPos: threadRoot ? null : parse.data.toPos ?? null,
    })
    .returning();

  if (report.status === "submitted") {
    await db
      .update(reports)
      .set({ status: "in_review", updatedAt: new Date() })
      .where(eq(reports.id, reportId));
  }

  return NextResponse.json({ comment: inserted });
}
