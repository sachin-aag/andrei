import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { isPasswordRecentlyUsed } from "@/lib/auth/password-history";
import { getPasswordPolicy } from "@/lib/auth/password-policy";

export async function POST(req: Request) {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { password } = (await req.json()) as { password?: string };

  if (!password) {
    return NextResponse.json(
      { error: "Enter a password to check." },
      { status: 400 }
    );
  }

  const [policy, wsUser] = await Promise.all([
    getPasswordPolicy(),
    db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.id, workspaceUserId),
      columns: { passwordHash: true, passwordHistory: true },
    }),
  ]);

  if (!wsUser?.passwordHash) {
    return NextResponse.json(
      { error: "This account does not have a password to change." },
      { status: 400 }
    );
  }

  const recentlyUsed = await isPasswordRecentlyUsed({
    password,
    currentPasswordHash: wsUser.passwordHash,
    passwordHistory: wsUser.passwordHistory,
    historyLimit: policy.passwordHistoryLimit,
  });

  return NextResponse.json({ recentlyUsed });
}
