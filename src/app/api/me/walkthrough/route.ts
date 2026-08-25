import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import {
  normalizeProductTourProgress,
  productTourProgressSchema,
  productTourSessionKeyFromAuth,
} from "@/lib/walkthrough/progress";

export async function GET() {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: {
      productTourStatus: true,
      productTourStepId: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ...normalizeProductTourProgress(row),
    sessionKey: productTourSessionKeyFromAuth(session),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = productTourProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tour progress" }, { status: 400 });
  }

  const { status, stepId } = parsed.data;
  const [updated] = await db
    .update(workspaceUsers)
    .set({
      productTourStatus: status,
      productTourStepId: stepId,
    })
    .where(eq(workspaceUsers.id, workspaceUserId))
    .returning({
      productTourStatus: workspaceUsers.productTourStatus,
      productTourStepId: workspaceUsers.productTourStepId,
    });

  if (!updated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(normalizeProductTourProgress(updated));
}
