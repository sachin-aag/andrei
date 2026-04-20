import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { criteriaEvaluations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

const bodySchema = z.object({
  fixApplied: z.boolean().optional(),
  bypassed: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ reportId: string; evaluationId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { evaluationId } = await params;

  const parse = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [updated] = await db
    .update(criteriaEvaluations)
    .set({
      ...parse.data,
      updatedAt: new Date(),
    })
    .where(eq(criteriaEvaluations.id, evaluationId))
    .returning();

  return NextResponse.json({ evaluation: updated });
}
