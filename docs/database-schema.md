# Database schema (PostgreSQL)

This document describes the application database so you can **recreate the schema** after a wipe or on a new environment. The **authoritative definition** is the Drizzle schema in [`src/db/schema/index.ts`](../src/db/schema/index.ts).

## Recreating the schema

Prerequisites: a Postgres connection string in `.env.local` as `DATABASE_URL` (e.g. Neon).

### Option A — Drizzle migrations (recommended)

Runs the SQL files under [`src/db/migrations/`](../src/db/migrations/) in journal order:

```bash
npm run db:migrate
```

Migration files (apply in order):

| File | Purpose |
|------|---------|
| [`0000_third_nighthawk.sql`](../src/db/migrations/0000_third_nighthawk.sql) | Enums, tables, foreign keys, unique index |
| [`0001_peaceful_rage.sql`](../src/db/migrations/0001_peaceful_rage.sql) | `comments`: `content_path`, `from_pos`, `to_pos` |

Ensure the Drizzle migrations table exists; `drizzle-kit migrate` applies pending migrations.

### Option B — Push schema from TypeScript (dev / empty DB)

Syncs the live schema to match [`src/db/schema/index.ts`](../src/db/schema/index.ts) (interactive in some setups):

```bash
npm run db:push
```

### Option C — Raw SQL

Concatenate and run the contents of `0000_*.sql` then `0001_*.sql` in a SQL console (strip `--> statement-breakpoint` comments if your tool does not accept them). Alternatively, generate a single script from the two files.

### Quick fix: missing `comments` columns (error 42703)

If the app fails selecting `content_path` / `from_pos` / `to_pos` on `comments`, apply only those columns (safe to re-run):

```bash
npm run db:fix-comments
```

This uses [`scripts/ensure-comment-columns.ts`](../scripts/ensure-comment-columns.ts) against `DATABASE_URL` in `.env.local`.

## Enum types

| Enum | Values |
|------|--------|
| `report_status` | `draft`, `submitted`, `in_review`, `feedback`, `approved` |
| `section_type` | `define`, `measure`, `analyze`, `improve`, `control`, `documents_reviewed`, `attachments` |
| `criterion_status` | `met`, `partially_met`, `not_met`, `not_evaluated` |
| `comment_status` | `open`, `resolved` |

## Tables

### `reports`

Deviation report header and workflow state.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `text` | Primary key; CUID |
| `deviation_no` | `text` | Not null |
| `date` | `timestamptz` | Default `now()` |
| `tools_used` | `jsonb` | `{ sixM, fiveWhy, brainstorming }` booleans |
| `other_tools` | `text` | Default `''` |
| `status` | `report_status` | Default `draft` |
| `author_id` | `text` | Not null |
| `assigned_manager_id` | `text` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

### `report_sections`

One row per report × section; body stored as JSON.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `text` | Primary key |
| `report_id` | `text` | FK → `reports.id`, `ON DELETE CASCADE` |
| `section` | `section_type` | Not null |
| `content` | `jsonb` | Default `{}` |
| `updated_at` | `timestamptz` | Default `now()` |

**Index:** unique on (`report_id`, `section`) — name `report_section_unique`.

### `criteria_evaluations`

AI / traffic-light criteria per report section.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `text` | Primary key |
| `report_id` | `text` | FK → `reports.id`, cascade |
| `section_id` | `text` | FK → `report_sections.id`, cascade |
| `section` | `section_type` | Not null |
| `criterion_key` | `text` | Not null |
| `criterion_label` | `text` | Not null |
| `status` | `criterion_status` | Default `not_evaluated` |
| `reasoning` | `text` | Default `''` |
| `suggested_fix` | `text` | Default `''` |
| `fix_applied` | `boolean` | Default `false` |
| `bypassed` | `boolean` | Default `false` |
| `updated_at` | `timestamptz` | Default `now()` |

### `comments`

Threaded comments; optional anchor to a section field and ProseMirror range for inline highlights.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `text` | Primary key |
| `report_id` | `text` | FK → `reports.id`, cascade |
| `section_id` | `text` | FK → `report_sections.id`, cascade, nullable |
| `section` | `section_type` | Nullable |
| `author_id` | `text` | Not null |
| `content` | `text` | Not null |
| `anchor_text` | `text` | Default `''` |
| `content_path` | `text` | Nullable; e.g. `narrative` within section JSON |
| `from_pos` | `integer` | Nullable; ProseMirror start |
| `to_pos` | `integer` | Nullable; ProseMirror end |
| `status` | `comment_status` | Default `open` |
| `created_at` | `timestamptz` | Default `now()` |

## Relationship summary

- `reports` 1 — * `report_sections`; deleting a report deletes its sections.
- `reports` 1 — * `criteria_evaluations` and `comments`.
- `report_sections` 1 — * `criteria_evaluations` and optionally `comments` (via `section_id`).

## Related project files

| File | Role |
|------|------|
| [`src/db/schema/index.ts`](../src/db/schema/index.ts) | Drizzle table definitions |
| [`drizzle.config.ts`](../drizzle.config.ts) | Drizzle Kit config |
| [`src/db/migrations/`](../src/db/migrations/) | Versioned SQL |
| [`src/db/index.ts`](../src/db/index.ts) | App DB client |
