import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaceUserId = user.id;

  const { currentPassword } = (await req.json()) as {
    currentPassword?: string;
  };

  if (!currentPassword) {
    return NextResponse.json(
      { error: "Enter your current password." },
      { status: 400 }
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: { passwordHash: true },
  });
  if (!wsUser?.passwordHash) {
    return NextResponse.json(
      { error: "This account does not have a password to change." },
      { status: 400 }
    );
  }

  const currentPasswordValid = await verifyPassword(
    currentPassword,
    wsUser.passwordHash
  );
  if (!currentPasswordValid) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
