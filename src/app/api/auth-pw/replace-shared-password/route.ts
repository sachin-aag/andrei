import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function POST(req: Request) {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { password, confirmPassword } = (await req.json()) as {
    password?: string;
    confirmPassword?: string;
  };

  if (!password || !confirmPassword) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: { id: true, passwordHash: true, mustChangePassword: true },
  });

  if (!wsUser?.passwordHash) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!wsUser.mustChangePassword) {
    return NextResponse.json(
      { error: "Password change is not required for this account." },
      { status: 403 }
    );
  }

  const sameAsTemporary = await verifyPassword(password, wsUser.passwordHash);
  if (sameAsTemporary) {
    return NextResponse.json(
      {
        error:
          "Choose a password different from the temporary one we gave you.",
      },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(password);
  await db
    .update(workspaceUsers)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(workspaceUsers.id, wsUser.id));

  return NextResponse.json({ ok: true });
}
