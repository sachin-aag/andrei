import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const migrationsFolder = path.join(process.cwd(), "src/db/migrations");
const journalPath = path.join(migrationsFolder, "meta/_journal.json");

type JournalEntry = {
  tag: string;
  when: number;
};

function migrationHash(tag: string): string {
  const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
  const query = fs.readFileSync(sqlPath, "utf8");
  return crypto.createHash("sha256").update(query).digest("hex");
}

/** Applies pending Drizzle SQL migrations (with push-DB baseline when needed). */
export async function runPendingMigrations(databaseUrl: string): Promise<void> {
  const sql = neon(databaseUrl);
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };

  const [{ exists: reportsExists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'reports'
    ) AS exists
  `;

  const existingMigrations = await sql`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
  `;

  if (reportsExists && existingMigrations.length === 0) {
    const baselineTag = "0007_unique_deviation_no";
    const baseline = journal.entries.find((e) => e.tag === baselineTag);
    if (!baseline) {
      throw new Error(`Journal missing baseline tag ${baselineTag}`);
    }
    const hash = migrationHash(baseline.tag);
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${baseline.when})
    `;
  }

  const db = drizzle(sql);
  await migrate(db, { migrationsFolder });
}
