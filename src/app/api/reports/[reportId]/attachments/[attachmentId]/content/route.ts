import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, attachmentId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );
  if (!attachment || !attachment.gcsGeneration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!attachment.permanentObjectKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const page = normalizedPage(new URL(req.url).searchParams.get("page"));
  if (page && attachment.pageCount && page > attachment.pageCount) {
    return NextResponse.json({ error: "Page out of range" }, { status: 400 });
  }

  const signedUrl = await getAttachmentStorage().getSignedReadUrl({
    objectKey: attachment.permanentObjectKey,
    generation: attachment.gcsGeneration,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  });
  const redirectUrl = signedUrl.startsWith("/")
    ? new URL(signedUrl, req.url).toString()
    : signedUrl;

  return NextResponse.redirect(appendPageFragment(redirectUrl, page));
}

function normalizedPage(raw: string | null): number | null {
  if (!raw) return null;
  const page = Number(raw);
  if (!Number.isInteger(page) || page <= 0) return null;
  return page;
}

function appendPageFragment(url: string, page: number | null): string {
  if (!page) return url;
  const withoutFragment = url.split("#")[0];
  return `${withoutFragment}#page=${page}`;
}
