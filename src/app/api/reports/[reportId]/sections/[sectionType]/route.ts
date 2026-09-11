import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { persistSectionContent } from "@/lib/reports/persist-section";
import { isValidSection } from "@/lib/document-types";
import {
  manualRevisionSummary,
  tryRecordManualDocumentRevision,
} from "@/lib/document-revisions/snapshot";
import { canSaveReportSection } from "@/lib/reports/access";
import { auditActorFromUser } from "@/lib/audit";
import { isLangfuseEnabled } from "@/lib/observability/langfuse";
import { checkSectionLlmAuthorship } from "@/lib/observability/llm-section-tracking";
import {
  recordUserEditedAfterScore,
  flushLangfuseScores,
} from "@/lib/observability/langfuse-scores";

/** PATCH and POST use the same body; POST exists for `navigator.sendBeacon` (always POST). */
async function saveSection(
  req: Request,
  { params }: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId, sectionType } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isValidSection(report.documentType, sectionType)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  if (!canSaveReportSection(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const content = "content" in body ? body.content : body;

  // Check if this section was recently LLM-authored before saving.
  // Skip the extra queries when Langfuse is off — scores would no-op anyway.
  const llmAuthorship = isLangfuseEnabled()
    ? await checkSectionLlmAuthorship(reportId, sectionType)
    : { wasLlmAuthored: false as const, reason: "not_llm_authored" as const };

  const saved = await persistSectionContent({
    actor: auditActorFromUser(user),
    reportId,
    section: sectionType,
    content: content as Record<string, unknown>,
  });

  await tryRecordManualDocumentRevision({
    reportId,
    documentType: report.documentType,
    createdBy: user.id,
    summary: manualRevisionSummary(report.documentType, sectionType),
  });

  // Record user_edited_after score if the section was LLM-authored
  if (llmAuthorship.wasLlmAuthored) {
    after(async () => {
      await recordUserEditedAfterScore({
        reportId,
        sectionId: sectionType,
        wasLlmGenerated: true,
        sessionId: reportId,
        llmAuthoredAt: llmAuthorship.lastModifiedAt,
      });
      await flushLangfuseScores();
    });
  }

  return NextResponse.json({ section: saved });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  return saveSection(req, ctx);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  return saveSection(req, ctx);
}
