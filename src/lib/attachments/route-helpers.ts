import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  canModifyReportAttachments,
  canViewReport,
} from "@/lib/reports/access";

export const runtime = "nodejs";

export async function loadReportForAttachments(reportId: string) {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  return report ?? null;
}

export async function requireReportAttachmentAccess(reportId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const report = await loadReportForAttachments(reportId);
  if (!report) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  if (!canViewReport(user, report)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, report };
}

export async function requireReportAttachmentModify(reportId: string) {
  const access = await requireReportAttachmentAccess(reportId);
  if ("error" in access) return access;

  if (!canModifyReportAttachments(access.user, access.report)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return access;
}

export function newAttachmentId(): string {
  return createId();
}
