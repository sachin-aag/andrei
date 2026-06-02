/**
 * Set or update a workspace user's password without sending email.
 * Use when corporate filters block magic-link / reset messages.
 *
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!'
 *
 * If the email is not in workspace_users, a new engineer row is created.
 *
 * Requires DATABASE_URL (.env.local or .env).
 */
import { createId } from "@paralleldrive/cuid2";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.error(
      "Usage: pnpm run set-workspace-password -- <email> <password>"
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: { id: true, name: true, email: true },
  });

  if (existing) {
    await db
      .update(workspaceUsers)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(workspaceUsers.id, existing.id));

    console.log(`Password updated for ${existing.name} <${existing.email}>`);
  } else {
    const name = displayNameFromEmail(email);
    const id = createId();
    await db.insert(workspaceUsers).values({
      id,
      name,
      email,
      role: "engineer",
      title: "Engineer",
      passwordHash,
      mustChangePassword: true,
    });

    console.log(`Created workspace user ${name} <${email}> (id: ${id})`);
  }

  console.log(
    "They must sign in at /login with this temporary password and choose a new one on first login."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
