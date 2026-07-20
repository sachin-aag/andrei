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

async function columnExists(
  pool: pg.Pool,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    ) AS exists`,
    [tableName, columnName]
  );
  return result.rows[0]?.exists ?? false;
}

function journalEntry(tag: string): JournalEntry | undefined {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries.find((entry) => entry.tag === tag);
}

async function applyMigrationStatements(
  pool: pg.Pool,
  tag: string
): Promise<void> {
  const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function clearPhantomJournalRows(
  pool: pg.Pool,
  tag: string
): Promise<void> {
  const entry = journalEntry(tag);
  const hash = migrationHash(tag);

  await pool.query(`DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1`, [
    hash,
  ]);
  if (entry) {
    await pool.query(
      `DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1`,
      [entry.when]
    );
  }
}

async function recordMigrationIfMissing(
  pool: pg.Pool,
  tag: string
): Promise<void> {
  const entry = journalEntry(tag);
  if (!entry) {
    return;
  }

  const hash = migrationHash(tag);
  const recorded = await recordedMigrationHashes(pool);
  if (!recorded.has(hash)) {
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when]
    );
  }
}

/** Apply one migration when its primary table is still missing. */
async function ensureMigrationTable(
  pool: pg.Pool,
  tag: string,
  tableName: string
): Promise<void> {
  if (await tableExists(pool, tableName)) {
    return;
  }

  await clearPhantomJournalRows(pool, tag);

  if (tag === "0032_chat_sessions" && (await tableExists(pool, "chat_messages"))) {
    const sessionIdCol = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'chat_messages'
            AND column_name = 'session_id'
        ) AS exists`
    );
    if (sessionIdCol.rows[0]?.exists) {
      await pool.query(`UPDATE chat_messages SET session_id = NULL`);
    }
  }

  await applyMigrationStatements(pool, tag);
  await recordMigrationIfMissing(pool, tag);
}

type SchemaRepair = {
  tag: string;
  tableName: string;
  prerequisites?: { tag: string; tableName: string }[];
};

/**
 * Re-apply an idempotent migration when a column it adds is missing, even
 * though its primary table already exists. Push-bootstrapped DBs can end up
 * with `chat_sessions` present but `chat_messages.session_id` never added, so
 * the table-only repair below skips it and every chat insert then throws.
 */
async function ensureMigrationColumn(
  pool: pg.Pool,
  tag: string,
  tableName: string,
  columnName: string
): Promise<void> {
  if (!(await tableExists(pool, tableName))) return;
  if (await columnExists(pool, tableName, columnName)) return;

  await applyMigrationStatements(pool, tag);
  await recordMigrationIfMissing(pool, tag);
}

/**
 * Apply idempotent schema repairs when a migration was journaled without SQL
 * (older deploy bug) or drizzle's timestamp-based migrator skipped it.
 */
async function repairMissingSchema(pool: pg.Pool): Promise<void> {
  const repairs: SchemaRepair[] = [
    {
      tag: "0032_chat_sessions",
      tableName: "chat_sessions",
      prerequisites: [{ tag: "0031_chat_messages", tableName: "chat_messages" }],
    },
  ];

  for (const repair of repairs) {
    for (const prerequisite of repair.prerequisites ?? []) {
      await ensureMigrationTable(
        pool,
        prerequisite.tag,
        prerequisite.tableName
      );
    }
    await ensureMigrationTable(pool, repair.tag, repair.tableName);
  }

  // Column-level repair: table exists but the added column doesn't.
  await ensureMigrationColumn(
    pool,
    "0032_chat_sessions",
    "chat_messages",
    "session_id"
  );
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
    await repairMissingSchema(pool);
    await ensurePushBaseline(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
