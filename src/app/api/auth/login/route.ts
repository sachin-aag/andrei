import { NextResponse } from "next/server";
import { z } from "zod";
import { setSession } from "@/lib/auth/session";
import { getWorkspaceUserById } from "@/lib/auth/workspace-users";
import { createCriteriaReviewReviewer } from "@/lib/criteria-review/reviewers";

const bodySchema = z.object({ userId: z.string() });

export async function POST(req: Request) {
  const parse = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const user = await getWorkspaceUserById(parse.data.userId);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 401 });
  }
  await setSession(user.id);
  try {
    await createCriteriaReviewReviewer({
      name: user.name,
      employeeId: user.employeeId,
    });
  } catch (error) {
    console.warn("[auth/login] Failed to sync criteria review reviewer:", error);
  }
  return NextResponse.json({ user });
}
