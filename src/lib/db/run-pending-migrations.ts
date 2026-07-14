import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

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

async function ensurePushBaseline(pool: pg.Pool): Promise<void> {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };

  const reportsResult = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'reports'
    ) AS exists`
  );
  const reportsExists = reportsResult.rows[0]?.exists ?? false;

  const migrationsTableResult = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    ) AS exists`
  );
  if (!migrationsTableResult.rows[0]?.exists) {
    return;
  }

  const existingMigrations = await pool.query<{
    hash: string;
    created_at: number;
  }>(
    `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`
  );

  if (reportsExists && existingMigrations.rows.length === 0) {
    const baselineTag = "0007_unique_deviation_no";
    const baseline = journal.entries.find((e) => e.tag === baselineTag);
    if (!baseline) {
      throw new Error(`Journal missing baseline tag ${baselineTag}`);
    }
    const hash = migrationHash(baseline.tag);
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, baseline.when]
    );
  }
}

/** Applies pending Drizzle SQL migrations (with push-DB baseline when needed). */
export async function runPendingMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await ensurePushBaseline(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
