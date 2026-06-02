/**
 * Set or update a workspace user's password without sending email.
 * Use when corporate filters block magic-link / reset messages.
 *
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!'
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!' --role manager
 *
 * If the email is not in workspace_users, a new row is created (default role: engineer).
 *
 * Uses DATABASE_URL from .env then .env.local (see docs/database-environments.md).
 * There is no Neon "branch" flag — whichever connection string is in DATABASE_URL wins.
 */
import { createId } from "@paralleldrive/cuid2";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

type UserRole = "engineer" | "manager";

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function titleForRole(role: UserRole): string {
  return role === "manager" ? "Manager" : "Engineer";
}

function parseRoleValue(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (value === "engineer" || value === "manager") return value;
  return undefined;
}

function parseArgs(argv: string[]) {
  let role: UserRole | undefined;
  let roleSpecified = false;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--role") {
      roleSpecified = true;
      role = parseRoleValue(argv[++i]);
      continue;
    }
    if (arg.startsWith("--role=")) {
      roleSpecified = true;
      role = parseRoleValue(arg.slice("--role=".length));
      continue;
    }
    positionals.push(arg);
  }

  return {
    email: positionals[0]?.trim().toLowerCase(),
    password: positionals[1],
    role,
    roleSpecified,
  };
}

function formatDatabaseTarget(url: string): string {
  try {
    const normalized = url.replace(/^postgres:\/\//, "postgresql://");
    const parsed = new URL(normalized);
    const host = parsed.hostname;
    const dbName = parsed.pathname.replace(/^\//, "") || "(default)";
    const kind =
      host === "localhost" || host === "127.0.0.1"
        ? "local Docker"
        : host.includes("neon")
          ? "Neon"
          : "Postgres";
    return `${kind} — host ${host}, database ${dbName}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

function scriptArgv(): string[] {
  return process.argv
    .slice(2)
    .filter(
      (arg) =>
        arg !== "--" &&
        !arg.endsWith("set-workspace-password.ts") &&
        !arg.includes("/scripts/set-workspace-password")
    );
}

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

async function main() {
  const { email, password, role, roleSpecified } = parseArgs(scriptArgv());

  if (!email || !password) {
    console.error(
      "Usage: pnpm run set-workspace-password -- <email> <password> [--role engineer|manager]"
    );
    process.exit(1);
  }

  if (roleSpecified && role === undefined) {
    console.error("--role must be engineer or manager");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (.env.local or .env)");
    process.exit(1);
  }

  console.log(`Target database: ${formatDatabaseTarget(databaseUrl)}`);
  console.log(
    "Tip: production uses Neon main — put that URL in .env.local, or run: vercel env pull .env.local --environment=production"
  );

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const effectiveRole: UserRole = role ?? "engineer";
  const passwordHash = await hashPassword(password);

  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: { id: true, name: true, email: true, role: true },
  });

  if (existing) {
    const update: {
      passwordHash: string;
      mustChangePassword: true;
      role?: UserRole;
      title?: string;
    } = { passwordHash, mustChangePassword: true };

    if (role !== undefined) {
      update.role = role;
      update.title = titleForRole(role);
    }

    await db
      .update(workspaceUsers)
      .set(update)
      .where(eq(workspaceUsers.id, existing.id));

    const roleNote =
      role !== undefined
        ? `, role set to ${role}`
        : ` (role unchanged: ${existing.role})`;
    console.log(
      `Password updated for ${existing.name} <${existing.email}>${roleNote}`
    );
  } else {
    const name = displayNameFromEmail(email);
    const id = createId();
    await db.insert(workspaceUsers).values({
      id,
      name,
      email,
      role: effectiveRole,
      title: titleForRole(effectiveRole),
      passwordHash,
      mustChangePassword: true,
    });

    console.log(
      `Created workspace user ${name} <${email}> (id: ${id}, role: ${effectiveRole})`
    );
  }

  console.log(
    "They must sign in at /login with this temporary password and choose a new one on first login."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
