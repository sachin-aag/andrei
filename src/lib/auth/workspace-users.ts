import { asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { employeeIdSchema } from "@/lib/auth/employee-id";
import { db, schema } from "@/db";
import {
  MOCK_USERS,
  type MockUser,
  type UserRole,
} from "@/lib/auth/mock-users-data";

function rowToUser(row: typeof schema.workspaceUsers.$inferSelect): MockUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    employeeId: row.employeeId,
    role: row.role,
    title: row.title,
  };
}

function isMissingWorkspaceUsersTable(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } };
  return err?.code === "42P01" || err?.cause?.code === "42P01";
}

/**
 * True when the DB is missing/unreachable in a way that should degrade to the
 * built-in mock roster instead of crashing the login page (CI without a real
 * `DATABASE_URL`, local dev without Neon, etc.).
 */
function isDbUnavailable(error: unknown): boolean {
  if (isMissingWorkspaceUsersTable(error)) return true;
  const err = error as {
    code?: string;
    name?: string;
    message?: string;
    cause?: { code?: string; name?: string; message?: string };
  };
  const codes = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ECONNRESET",
    "3D000", // database does not exist
    "28P01", // invalid password
    "57P03", // cannot connect now
  ]);
  if (err?.code && codes.has(err.code)) return true;
  if (err?.cause?.code && codes.has(err.cause.code)) return true;
  const message = `${err?.message ?? ""} ${err?.cause?.message ?? ""}`.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("connect econnrefused") ||
    message.includes("getaddrinfo") ||
    message.includes("failed to fetch")
  );
}

function sortedMockUsers(): MockUser[] {
  return [...MOCK_USERS].sort((a, b) => a.name.localeCompare(b.name));
}

function emailForName(name: string, employeeId: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const local = slug || `user.${employeeId}`;
  return `${local}@mjbiopharm.com`;
}

export async function ensureWorkspaceUsersSeeded(): Promise<void> {
  for (const user of MOCK_USERS) {
    await db
      .insert(schema.workspaceUsers)
      .values({
        id: user.id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        title: user.title,
      })
      .onConflictDoNothing();
  }
}

export async function listWorkspaceUsers(): Promise<MockUser[]> {
  try {
    await ensureWorkspaceUsersSeeded();
    const rows = await db.query.workspaceUsers.findMany({
      orderBy: [asc(schema.workspaceUsers.name)],
    });
    return rows.map(rowToUser);
  } catch (error) {
    if (isDbUnavailable(error)) {
      console.warn(
        "[workspace-users] DB unavailable, returning mock roster:",
        (error as Error)?.message
      );
      return sortedMockUsers();
    }
    throw error;
  }
}

export async function getWorkspaceUserById(
  id: string | null | undefined
): Promise<MockUser | undefined> {
  if (!id) return undefined;
  const mock = MOCK_USERS.find((user) => user.id === id);
  if (mock) return mock;

  try {
    await ensureWorkspaceUsersSeeded();
    const row = await db.query.workspaceUsers.findFirst({
      where: eq(schema.workspaceUsers.id, id),
    });
    return row ? rowToUser(row) : undefined;
  } catch (error) {
    if (isDbUnavailable(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function createWorkspaceUser(params: {
  name: string;
  employeeId: string;
  role?: UserRole;
  title?: string;
  email?: string;
}): Promise<MockUser> {
  const name = params.name.trim();
  const employeeIdParse = employeeIdSchema.safeParse(params.employeeId);
  if (!employeeIdParse.success) {
    throw new Error(
      employeeIdParse.error.issues[0]?.message ?? "Invalid employee ID."
    );
  }
  const employeeId = employeeIdParse.data;
  if (!name) {
    throw new Error("Name and employee ID are required.");
  }

  try {
    await ensureWorkspaceUsersSeeded();
  } catch (error) {
    if (isMissingWorkspaceUsersTable(error)) {
      throw new Error(
        "workspace_users table is missing. Run: npm run db:ensure-workspace-users"
      );
    }
    throw error;
  }

  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(schema.workspaceUsers.employeeId, employeeId),
  });
  if (existing) {
    return rowToUser(existing);
  }

  const role = params.role ?? "engineer";
  const user: MockUser = {
    id: createId(),
    name,
    email: params.email?.trim() || emailForName(name, employeeId),
    employeeId,
    role,
    title: params.title?.trim() || (role === "manager" ? "Manager" : "Engineer"),
  };

  await db.insert(schema.workspaceUsers).values({
    id: user.id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    role: user.role,
    title: user.title,
  });

  return user;
}
