import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { USER_ROLES, defaultTitleForRole } from "@/lib/auth/roles";
import { adminUserFromRow, listAdminUsers } from "@/lib/admin/users";
import { getPasswordPolicy } from "@/lib/auth/password-policy";

const createUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email(),
  role: z.enum(USER_ROLES),
  temporaryPassword: z.string().min(8),
});

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Only admins can manage users" },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const parsed = createUserSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.temporaryPassword);
  const name = parsed.data.name ?? displayNameFromEmail(email);

  try {
    const [created] = await db
      .insert(workspaceUsers)
      .values({
        id: createId(),
        name,
        email,
        role: parsed.data.role,
        title: defaultTitleForRole(parsed.data.role),
        passwordHash,
        mustChangePassword: true,
      })
      .returning();

    if (!created) {
      throw new Error("insert(workspaceUsers).returning() returned no row");
    }

    const policy = await getPasswordPolicy();
    return NextResponse.json(
      { user: adminUserFromRow(created, policy) },
      { status: 201 }
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Could not create user." },
      { status: 500 }
    );
  }
}
