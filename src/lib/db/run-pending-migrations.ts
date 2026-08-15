import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { normalizeDatabaseUrl } from "@/db/connection";
import {
  shouldReplayUnrecordedMigrationTag,
  tagsToStampOnEmptyPushJournal,
} from "@/lib/db/push-baseline-tags";
import { isIgnorableSchemaReplayError } from "@/lib/db/schema-replay-errors";

const migrationsFolder = path.join(process.cwd(), "src/db/migrations");
const journalPath = path.join(migrationsFolder, "meta/_journal.json");

/** SQL files applied via push + manual baseline but not always in the journal. */
const EXTRA_MIGRATION_TAGS = ["0030_conclusion_section"] as const;

/**
 * Stable `created_at` for extra tags. Must sit between neighboring journal
 * entries (0029…0031). Never use `Date.now()` — drizzle's migrator skips any
 * journal entry whose `when` is ≤ the max recorded `created_at`.
 */
const EXTRA_MIGRATION_WHEN: Record<(typeof EXTRA_MIGRATION_TAGS)[number], number> = {
  "0030_conclusion_section": 1_782_415_200_000,
};

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
    try {
      await pool.query(statement);
    } catch (error) {
      if (!isIgnorableSchemaReplayError(error)) {
        throw error;
      }
      const preview = statement.replace(/\s+/g, " ").slice(0, 96);
      console.error(`schema replay: already exists, skipping: ${preview}`);
    }
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
 * Fix extra-tag rows seeded with `Date.now()`, which otherwise sit after later
 * journal `when` values and cause drizzle `migrate()` to skip them forever.
 */
async function repairAnomalousMigrationTimestamps(
  pool: pg.Pool
): Promise<void> {
  for (const tag of EXTRA_MIGRATION_TAGS) {
    const hash = migrationHash(tag);
    const fixedWhen = EXTRA_MIGRATION_WHEN[tag];
    await pool.query(
      `UPDATE drizzle.__drizzle_migrations
       SET created_at = $1
       WHERE hash = $2 AND created_at > $1`,
      [fixedWhen, hash]
    );
  }
}

/**
 * Apply idempotent schema repairs when a migration was journaled without SQL
 * (older deploy bug) or drizzle's timestamp-based migrator skipped it.
 */
async function repairMissingSchema(pool: pg.Pool): Promise<void> {
  // Fresh DB: plain migrate() builds everything in order, and applying a later
  // migration here first would fail on its foreign keys.
  if (!(await tableExists(pool, "reports"))) return;

  await repairAnomalousMigrationTimestamps(pool);

  const repairs: SchemaRepair[] = [
    {
      tag: "0032_chat_sessions",
      tableName: "chat_sessions",
      prerequisites: [{ tag: "0031_chat_messages", tableName: "chat_messages" }],
    },
    {
      tag: "0033_report_attachments",
      tableName: "report_attachments",
    },
    {
      tag: "0035_attachment_folders",
      tableName: "report_attachment_folders",
      prerequisites: [
        { tag: "0033_report_attachments", tableName: "report_attachments" },
      ],
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
  await ensureMigrationColumn(
    pool,
    "0034_audit_canonical_v2",
    "audit_events",
    "payload_version"
  );
  await ensureMigrationColumn(
    pool,
    "0035_attachment_folders",
    "report_attachments",
    "folder_id"
  );
  await ensureMigrationColumn(
    pool,
    "0036_attachment_description",
    "report_attachments",
    "description"
  );
  await ensureAuditHashChainTriggers(pool);
}

/**
 * Push-bootstrapped DBs often have `audit_events` without the hash-chain
 * trigger or `pgcrypto`. 0034 only replaces the function body — recreate the
 * trigger if missing so inserts actually chain hashes.
 */
async function ensureAuditHashChainTriggers(pool: pg.Pool): Promise<void> {
  if (!(await tableExists(pool, "audit_events"))) return;

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  const existing = await pool.query<{ tgname: string }>(
    `SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'audit_events'::regclass
       AND NOT tgisinternal
       AND tgname IN (
         'audit_events_hash_chain',
         'audit_events_append_only_update',
         'audit_events_append_only_delete'
       )`
  );
  const have = new Set(existing.rows.map((row) => row.tgname));
  if (
    have.has("audit_events_hash_chain") &&
    have.has("audit_events_append_only_update") &&
    have.has("audit_events_append_only_delete")
  ) {
    return;
  }

  // Ensure the v2 hash function body is present before attaching the trigger.
  // Push-bootstrapped DBs often have columns without PL/pgSQL functions from 0027/0034.
  if (await columnExists(pool, "audit_events", "payload_version")) {
    await applyMigrationStatements(pool, "0034_audit_canonical_v2");
  }

  // 0034 does not define this guard — recreate it so append-only triggers can attach.
  await pool.query(`
    CREATE OR REPLACE FUNCTION audit_append_only_guard()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Append-only table: % on % is not permitted', TG_OP, TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
  `);

  if (!have.has("audit_events_hash_chain")) {
    await pool.query(`
      DROP TRIGGER IF EXISTS audit_events_hash_chain ON audit_events;
      CREATE TRIGGER audit_events_hash_chain
        BEFORE INSERT ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION audit_events_before_insert();
    `);
  }
  if (!have.has("audit_events_append_only_update")) {
    await pool.query(`
      DROP TRIGGER IF EXISTS audit_events_append_only_update ON audit_events;
      CREATE TRIGGER audit_events_append_only_update
        BEFORE UPDATE ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION audit_append_only_guard();
    `);
  }
  if (!have.has("audit_events_append_only_delete")) {
    await pool.query(`
      DROP TRIGGER IF EXISTS audit_events_append_only_delete ON audit_events;
      CREATE TRIGGER audit_events_append_only_delete
        BEFORE DELETE ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION audit_append_only_guard();
    `);
  }
}

/**
 * Neon/Vercel DBs are often bootstrapped with `drizzle-kit push` (see
 * docs/whitelabel-vercel-deploy.md). Without seeding the migration journal,
 * `migrate()` replays 0000 and fails on types/tables that already exist.
 *
 * When the journal is **empty** but `reports` already exists, mark
 * migrations whose objects are already present as applied. If repair
 * recorded 0033 first, still stamp missing 0000–0029 on pre-0037 MJ.
 *
 * MJ production was push-managed through 0029 (`deviation_no`, no
 * `document_no`). Stamping 0030+ there would skip the destructive
 * 0037 SQL. Those tags stay unstamped until `document_no` exists so
 * `migrate()` can apply them. 0030 (not in the journal) is applied as
 * extra SQL on that path.
 *
 * If the journal already has rows **and** `document_no` exists, new SQL
 * files must run through `migrate()` — never insert hashes for missing
 * entries. Pre-0037 MJ is the exception: repair may have recorded 0033
 * first, so we still stamp missing 0000–0029 even when the journal is
 * non-empty.
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
  const hasDocumentNoColumn = await columnExists(pool, "reports", "document_no");
  if (recorded.size > 0 && hasDocumentNoColumn) {
    return;
  }
  const extraTags = EXTRA_MIGRATION_TAGS.filter((tag) =>
    fs.existsSync(path.join(migrationsFolder, `${tag}.sql`))
  );
  const tagsToStamp = tagsToStampOnEmptyPushJournal({
    journalTags: journal.entries.map((entry) => entry.tag),
    extraTags,
    hasDocumentNoColumn,
  });
  const stamped = new Set(tagsToStamp);
  if (!hasDocumentNoColumn) {
    console.error(
      "reports exists without document_no — pre-0037 MJ schema; not stamping 0030+ so migrate() can apply them"
    );
  }

  const whenByTag = new Map<string, number>([
    ...journal.entries.map((entry) => [entry.tag, entry.when] as const),
    ...extraTags.map((tag) => [tag, EXTRA_MIGRATION_WHEN[tag]] as const),
  ]);

  for (const tag of tagsToStamp) {
    const hash = migrationHash(tag);
    if (recorded.has(hash)) {
      continue;
    }
    const when = whenByTag.get(tag);
    if (when === undefined) continue;
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, when]
    );
    recorded.add(hash);
  }

  // 0030 is on disk but not in _journal.json. Pre-cutover MJ still needs
  // the ADD VALUE so 0037 can drop section_type cleanly.
  for (const tag of extraTags) {
    if (stamped.has(tag)) continue;
    await applyMigrationStatements(pool, tag);
    const hash = migrationHash(tag);
    if (recorded.has(hash)) continue;
    const when = EXTRA_MIGRATION_WHEN[tag];
    if (when === undefined) continue;
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, when]
    );
    recorded.add(hash);
  }
}

/**
 * Apply journal tags whose hashes are not recorded yet, ignoring leftover
 * enums/columns from drizzle-kit push. Runs only when `reports` exists so a
 * fresh database still goes through `migrate()` from 0000.
 *
 * Drizzle's migrator executes CREATE TYPE as-is, so a push-polluted MJ
 * database would fail on 0033/0037 even after the table-repair pass.
 */
async function replayUnrecordedMigrations(pool: pg.Pool): Promise<void> {
  if (!(await tableExists(pool, "reports"))) {
    return;
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  const recorded = await recordedMigrationHashes(pool);
  const hasDocumentNoColumn = await columnExists(pool, "reports", "document_no");

  for (const entry of journal.entries) {
    const hash = migrationHash(entry.tag);
    if (recorded.has(hash)) {
      continue;
    }
    if (
      !shouldReplayUnrecordedMigrationTag({
        tag: entry.tag,
        hasDocumentNoColumn,
      })
    ) {
      continue;
    }
    console.error(`schema replay: applying unrecorded ${entry.tag}`);
    await applyMigrationStatements(pool, entry.tag);
    await recordMigrationIfMissing(pool, entry.tag);
    recorded.add(hash);
  }
}

/** Applies pending Drizzle SQL migrations (with push-DB baseline when needed). */
export async function runPendingMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString: normalizeDatabaseUrl(databaseUrl),
    max: 1,
    connectionTimeoutMillis: 60_000,
  });
  try {
    await ensureMigrationsTable(pool);
    await ensurePushBaseline(pool);
    await repairMissingSchema(pool);
    await replayUnrecordedMigrations(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
