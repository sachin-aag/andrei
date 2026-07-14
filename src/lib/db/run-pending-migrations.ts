import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const migrationsFolder = path.join(process.cwd(), "src/db/migrations");
const journalPath = path.join(migrationsFolder, "meta/_journal.json");

/** SQL files applied via push + manual baseline but not always in the journal. */
const EXTRA_MIGRATION_TAGS = ["0030_conclusion_section"] as const;

type JournalEntry = {
  tag: string;
  when: number;
};

function migrationHash(tag: string): string {
  const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
  const query = fs.readFileSync(sqlPath, "utf8");
  return crypto.createHash("sha256").update(query).digest("hex");
}

async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function recordedMigrationHashes(pool: pg.Pool): Promise<Set<string>> {
  const result = await pool.query<{ hash: string }>(
    `SELECT hash FROM drizzle.__drizzle_migrations`
  );
  return new Set(result.rows.map((row) => row.hash));
}

async function tableExists(pool: pg.Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Remove journal rows that were baselined without running SQL (older deploy bug).
 * Lets `migrate()` replay the real migration on the next deploy.
 */
async function repairPhantomBaselines(pool: pg.Pool): Promise<void> {
  const repairs: { tag: string; tableName: string }[] = [
    { tag: "0032_chat_sessions", tableName: "chat_sessions" },
  ];

  const recorded = await recordedMigrationHashes(pool);
  for (const { tag, tableName } of repairs) {
    if (await tableExists(pool, tableName)) {
      continue;
    }
    const hash = migrationHash(tag);
    if (!recorded.has(hash)) {
      continue;
    }
    await pool.query(`DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1`, [
      hash,
    ]);
    recorded.delete(hash);
  }
}

/**
 * Neon/Vercel DBs are often bootstrapped with `drizzle-kit push` (see
 * docs/whitelabel-vercel-deploy.md). Without seeding the migration journal,
 * `migrate()` replays 0000 and fails on types/tables that already exist.
 *
 * Only when the journal is **empty** but `reports` already exists, mark every
 * known migration as applied. If the journal already has rows, new SQL files
 * must run through `migrate()` — never insert hashes for missing entries.
 */
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
  if (!reportsResult.rows[0]?.exists) {
    return;
  }

  await ensureMigrationsTable(pool);
  const recorded = await recordedMigrationHashes(pool);
  if (recorded.size > 0) {
    return;
  }

  const tagsToSeed: { tag: string; when: number }[] = [
    ...journal.entries.map((entry) => ({ tag: entry.tag, when: entry.when })),
    ...EXTRA_MIGRATION_TAGS.filter((tag) =>
      fs.existsSync(path.join(migrationsFolder, `${tag}.sql`))
    ).map((tag) => ({ tag, when: Date.now() })),
  ];

  for (const { tag, when } of tagsToSeed) {
    const hash = migrationHash(tag);
    if (recorded.has(hash)) {
      continue;
    }
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, when]
    );
    recorded.add(hash);
  }
}

/** Applies pending Drizzle SQL migrations (with push-DB baseline when needed). */
export async function runPendingMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await ensureMigrationsTable(pool);
    await repairPhantomBaselines(pool);
    await ensurePushBaseline(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
