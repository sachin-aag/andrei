-- Read-only preflight for MJ production before migrations 0030–0037.
-- Any row from the duplicate query fails CREATE UNIQUE INDEX
-- reports_document_no_unique mid-migration. Stop and fix before running SQL.
--
--   psql "$MJ_DATABASE_URL" -f scripts/mj-cutover-preflight.sql

\echo === drizzle journal (may be empty on push-managed MJ) ===
SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations_table;

SELECT hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at
LIMIT 50;

\echo === duplicate (author_id, deviation_no) — must be empty ===
SELECT author_id, deviation_no, count(*)
FROM reports
GROUP BY 1, 2
HAVING count(*) > 1;

\echo === schema fingerprint ===
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'deviation_no'
  ) AS has_deviation_no,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'document_no'
  ) AS has_document_no,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'tools_used'
  ) AS has_tools_used,
  EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'section_type'
  ) AS has_section_type_enum;

\echo === report counts ===
SELECT count(*) AS reports FROM reports;
