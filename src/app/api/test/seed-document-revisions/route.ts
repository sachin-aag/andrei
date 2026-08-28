import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportSections, reports } from "@/db/schema";
import { snapshotDocumentRevision } from "@/lib/document-revisions/snapshot";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

const FROM_TEXT =
  "The assay failed due to temperature drift on filling line FL-01.";
const TO_TEXT =
  "The assay failed due to humidity excursion on filling line FL-01.";

function narrativeDoc(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

const bodySchema = z.object({
  reportId: z.string().min(1),
});

/**
 * Seeds two Agent-chrome document versions so E2E can open History → Compare
 * without Gemini. Gated like `/api/test/login`; never enabled on Vercel.
 */
export async function POST(req: Request) {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { reportId } = parsed.data;
  const [report] = await db
    .select({
      id: reports.id,
      documentType: reports.documentType,
    })
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const versions = [
    {
      text: FROM_TEXT,
      summary: "Added temperature drift from the batch record.",
    },
    {
      text: TO_TEXT,
      summary: "Replaced temperature with humidity from the logger.",
    },
  ];

  const revisions: { id: string; revisionNo: number; summary: string }[] = [];
  for (const version of versions) {
    const content = { narrative: narrativeDoc(version.text) };
    const [existing] = await db
      .select({ id: reportSections.id })
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, reportId),
          eq(reportSections.section, "define")
        )
      );
    if (!existing) {
      await db.insert(reportSections).values({
        reportId,
        section: "define",
        content,
      });
    } else {
      await db
        .update(reportSections)
        .set({ content, updatedAt: new Date() })
        .where(eq(reportSections.id, existing.id));
    }

    const revision = await snapshotDocumentRevision({
      reportId,
      documentType: report.documentType,
      summary: version.summary,
      createdBy: null,
    });
    revisions.push({
      id: revision.id,
      revisionNo: revision.revisionNo,
      summary: revision.summary,
    });
  }

  return NextResponse.json({ ok: true, revisions });
}
