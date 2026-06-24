import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordSectionVersion } from "@/lib/audit";
import { generateGuidedDraft } from "@/lib/ai/generate-draft";
import { EDITABLE_SECTIONS } from "@/types/sections";

const bodySchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      section: z.enum(["define", "measure", "analyze", "improve", "control"]),
      criteriaKeys: z.array(z.string()),
      label: z.string(),
      description: z.string().optional(),
      inputType: z.enum(["text", "textarea", "choice"]),
      options: z.array(z.string()).optional(),
      required: z.boolean(),
    })
  ),
  answers: z.record(z.string(), z.string().nullable()),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "engineer" || user.id !== report.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (report.status !== "draft" && report.status !== "feedback") {
    return NextResponse.json(
      { error: "Report is not in a editable state" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { questions, answers } = parsed.data;

  try {
    const generated = await generateGuidedDraft({
      reportContext: { deviationNo: report.deviationNo, date: report.date },
      questions,
      answers,
    });

    // Save each generated section to the DB
    const sectionRows = await db
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, reportId));

    const sectionByType = new Map(sectionRows.map((r) => [r.section, r]));

    for (const section of EDITABLE_SECTIONS) {
      const content = generated[section];
      if (!content) continue;

      const existing = sectionByType.get(section);

      if (!existing) {
        const [inserted] = await db
          .insert(reportSections)
          .values({
            reportId,
            section,
            content: content as Record<string, unknown>,
          })
          .returning();

        await recordSectionVersion({
          actor: auditActorFromUser(user),
          reportId,
          sectionId: inserted.id,
          section,
          previousContent: {},
          newContent: content,
        });
      } else {
        await recordSectionVersion({
          actor: auditActorFromUser(user),
          reportId,
          sectionId: existing.id,
          section,
          previousContent: existing.content,
          newContent: content,
        });

        await db
          .update(reportSections)
          .set({ content: content as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(reportSections.id, existing.id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[guided-draft] generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate draft. Please try again." },
      { status: 500 }
    );
  }
}
