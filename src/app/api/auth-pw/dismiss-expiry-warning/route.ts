import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import {
  computePasswordExpiryState,
  getPasswordPolicy,
  nextPasswordWarningDismissal,
} from "@/lib/auth/password-policy";

export async function POST() {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await getPasswordPolicy();
  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: {
      id: true,
      passwordHash: true,
      passwordChangedAt: true,
      passwordExpiryWarningDismissedUntil: true,
    },
  });

  if (!wsUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = computePasswordExpiryState(wsUser, policy);
  if (!state.expiresAt || state.expired) {
    return NextResponse.json({ ok: true });
  }

  await db
    .update(workspaceUsers)
    .set({
      passwordExpiryWarningDismissedUntil: nextPasswordWarningDismissal(
        state.expiresAt
      ),
    })
    .where(eq(workspaceUsers.id, wsUser.id));

  return NextResponse.json({ ok: true });
}
