import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { isWorkspaceUserLocked } from "@/lib/auth/workspace-login";

// No need for redundant allow lists; rely on the database to control allowed users.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email) return NextResponse.json({ allowed: false });

  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, email),
      columns: { id: true, passwordHash: true },
    });
    const locked = wsUser ? await isWorkspaceUserLocked(email) : false;
    return NextResponse.json({
      allowed: !!wsUser,
      hasPassword: !!wsUser?.passwordHash,
      locked,
    });
  } catch (error) {
    console.error("Failed to check auth email", error);
    return NextResponse.json(
      { error: "Could not check this email. Please try again." },
      { status: 500 }
    );
  }
}
