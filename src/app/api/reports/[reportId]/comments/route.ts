import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { isValidSection } from "@/lib/document-types";
import { commentsVisibleToWorkspaceWhere } from "@/lib/suggestions/visible-comments";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Ordinary dismissals are kept in the DB for audit / undo but excluded from
  // the UI by default. Superseded dismissals stay visible so they can be
  // reopened. Pass ?include=dismissed when you genuinely need every row.
  const url = new URL(req.url);
  const includeDismissed = url.searchParams.get("include") === "dismissed";

  const where = includeDismissed
    ? eq(comments.reportId, reportId)
    : commentsVisibleToWorkspaceWhere(reportId);

  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows });
}

const COMMENT_MAX_LENGTH = 1024;
const REPLY_MAX_LENGTH = 512;

const createSchema = z.object({
  content: z.string().min(1),
  parentId: z.string().optional().nullable(),
  anchorText: z.string().optional().default(""),
  sectionId: z.string().optional(),
  section: z.string().optional(),
  contentPath: z.string().optional().nullable(),
  fromPos: z.number().int().optional().nullable(),
  toPos: z.number().int().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { user, report } = access;

  const parse = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (
    parse.data.section &&
    !isValidSection(report.documentType, parse.data.section)
  ) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
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
        : (parse.data.section ?? null),
      authorId: user.id,
      content: parse.data.content,
      anchorText: threadRoot ? "" : parse.data.anchorText ?? "",
      contentPath: threadRoot ? threadRoot.contentPath : parse.data.contentPath ?? null,
      fromPos: threadRoot ? null : parse.data.fromPos ?? null,
      toPos: threadRoot ? null : parse.data.toPos ?? null,
    })
    .returning();

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "comment_created",
    entityType: "comment",
    entityId: inserted.id,
    reportId,
    summary: `Comment created${inserted.section ? ` in ${inserted.section}` : ""}`,
    newValue: {
      content: inserted.content,
      section: inserted.section,
      parentId: inserted.parentId,
    },
  });

  if (report.status === "submitted") {
    const previousStatus = report.status;
    const reviewUpdate: {
      status: "in_review";
      updatedAt: Date;
      reviewedById?: string;
    } = { status: "in_review", updatedAt: new Date() };
    if (user.role === "manager" && !report.reviewedById) {
      reviewUpdate.reviewedById = user.id;
    }
    await db
      .update(reports)
      .set(reviewUpdate)
      .where(eq(reports.id, reportId));

    await recordAuditEvent({
      actor: auditActorFromUser(user),
      action: "report_updated",
      entityType: "report",
      entityId: reportId,
      reportId,
      summary: "Report moved to in_review after first comment",
      oldValue: { status: previousStatus },
      newValue: { status: "in_review" },
    });
  }

  return NextResponse.json({ comment: inserted });
}
