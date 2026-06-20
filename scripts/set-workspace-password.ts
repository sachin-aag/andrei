/**
 * Set or update a workspace user's password without sending email.
 * Use when corporate filters block magic-link / reset messages.
 *
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!'
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!' --role manager
 *   pnpm run set-workspace-password -- admin@mjbiopharm.com 'TemporaryPass123!' --role admin
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!' --env-file .env
 *
 * If the email is not in workspace_users, a new row is created (default role: engineer).
 *
 * Default: loads DATABASE_URL from .env then .env.local (local overrides).
 * --env-file <path>: loads only the specified file (skips .env.local).
 */
import { config as loadEnv } from "dotenv";

// ---------------------------------------------------------------------------
// 1. Parse --env-file BEFORE any @/db imports (db reads DATABASE_URL on import)
// ---------------------------------------------------------------------------

function extractEnvFile(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--env-file" && argv[i + 1]) return argv[i + 1];
    if (argv[i]?.startsWith("--env-file=")) return argv[i].slice("--env-file=".length);
  }
  return undefined;
}

const envFile = extractEnvFile(process.argv);

if (envFile) {
  loadEnv({ path: envFile, override: true });
} else {
  loadEnv({ path: ".env" });
  loadEnv({ path: ".env.local", override: true });
}

// ---------------------------------------------------------------------------
// 2. Now it's safe to import modules that read DATABASE_URL
// ---------------------------------------------------------------------------

type UserRole = "engineer" | "manager" | "admin";

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function titleForRole(role: UserRole): string {
  switch (role) {
    case "engineer":
      return "Engineer";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

function parseRoleValue(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (value === "engineer" || value === "manager" || value === "admin") {
    return value;
  }
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
    if (arg === "--env-file") {
      i++;
      continue;
    }
    if (arg.startsWith("--env-file=")) continue;
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

async function main() {
  // Dynamic imports — db reads DATABASE_URL which is now set
  const { createId } = await import("@paralleldrive/cuid2");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { workspaceUsers } = await import("@/db/schema");
  const { hashPassword } = await import("@/lib/auth/password");
  const { nextPasswordHistory } = await import("@/lib/auth/password-history");
  const { getPasswordPolicy, validatePasswordPolicy } = await import(
    "@/lib/auth/password-policy"
  );

  const { email, password, role, roleSpecified } = parseArgs(scriptArgv());

  if (!email || !password) {
    console.error(
      "Usage: pnpm run set-workspace-password -- <email> <password> [--role engineer|manager|admin] [--env-file .env]"
    );
    process.exit(1);
  }

  if (roleSpecified && role === undefined) {
    console.error("--role must be engineer, manager, or admin");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (.env.local or .env)");
    process.exit(1);
  }

  const source = envFile ? envFile : ".env + .env.local";
  console.log(`Env loaded from: ${source}`);
  console.log(`Target database: ${formatDatabaseTarget(databaseUrl)}`);

  const policy = await getPasswordPolicy();
  const validation = validatePasswordPolicy(password);
  if (!validation.ok) {
    console.error(validation.errors.join(" "));
    process.exit(1);
  }

  const effectiveRole: UserRole = role ?? "engineer";
  const passwordHash = await hashPassword(password);
  const changedAt = new Date();

  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: { id: true, name: true, email: true, role: true, passwordHash: true, passwordHistory: true },
  });

  if (existing) {
    const update: {
      passwordHash: string;
      mustChangePassword: true;
      passwordChangedAt: Date;
      failedLoginAttempts: 0;
      lockedAt: null;
      passwordExpiryWarningDismissedUntil: null;
      passwordHistory: string[];
      role?: UserRole;
      title?: string;
    } = {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: changedAt,
      failedLoginAttempts: 0,
      lockedAt: null,
      passwordExpiryWarningDismissedUntil: null,
      passwordHistory: nextPasswordHistory({
        currentHistory: existing.passwordHistory,
        previousPasswordHash: existing.passwordHash,
        historyLimit: policy.passwordHistoryLimit,
      }),
    };

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
      passwordChangedAt: changedAt,
      failedLoginAttempts: 0,
      lockedAt: null,
      passwordExpiryWarningDismissedUntil: null,
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
