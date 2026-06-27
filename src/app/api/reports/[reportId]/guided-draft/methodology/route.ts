import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { suggestInvestigationMethodology } from "@/lib/ai/suggest-methodology";

const answeredRecordSchema = z.object({
  section: z.string(),
  criteriaKeys: z.array(z.string()),
  label: z.string(),
  answer: z.string().nullable(),
});

const bodySchema = z.object({
  defineAnswers: z.array(answeredRecordSchema),
  measureAnswers: z.array(answeredRecordSchema),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const [report] = await db
    .select({ authorId: reports.authorId, deviationNo: reports.deviationNo })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "engineer" || user.id !== report.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const suggestion = await suggestInvestigationMethodology({
      deviationNo: report.deviationNo,
      defineAnswers: body.data.defineAnswers as Parameters<
        typeof suggestInvestigationMethodology
      >[0]["defineAnswers"],
      measureAnswers: body.data.measureAnswers as Parameters<
        typeof suggestInvestigationMethodology
      >[0]["measureAnswers"],
    });

    return NextResponse.json(suggestion);
  } catch (err) {
    console.error("[guided-draft/methodology] error:", err);
    // Don't block the user — fall back to combined
    return NextResponse.json({ methodology: "combined", reasoning: "" });
  }
}
