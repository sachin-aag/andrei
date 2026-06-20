import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(8),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage users" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResponse = await requireAdmin();
  if (authResponse) return authResponse;

  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { userId } = await params;
  const passwordHash = await hashPassword(parsed.data.temporaryPassword);
  const [updated] = await db
    .update(workspaceUsers)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(workspaceUsers.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      mustChangePassword: updated.mustChangePassword,
      hasPassword: updated.passwordHash !== null,
    },
  });
}
