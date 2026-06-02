/**
 * Set or update a workspace user's password without sending email.
 * Use when corporate filters block magic-link / reset messages.
 *
 *   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!'
 *
 * Requires DATABASE_URL (.env.local or .env). User must already exist in workspace_users.
 */
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

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

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: { id: true, name: true, email: true },
  });

  if (!wsUser) {
    console.error(`No workspace user found for ${email}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(workspaceUsers)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(workspaceUsers.id, wsUser.id));

  console.log(`Password updated for ${wsUser.name} <${wsUser.email}>`);
  console.log(
    "They must sign in at /login with this temporary password and choose a new one on first login."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
