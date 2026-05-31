# Database environments

The app uses a single env var: **`DATABASE_URL`**. Different environments point at different Neon branches (or local Docker).

## Automated flow (Vercel + Neon)

When the [Neon/Vercel integration](./neon-vercel-setup.md) has **preview branching** enabled:

| Event | Database | Migrations |
|-------|----------|------------|
| **PR opened / updated** | Neon creates an isolated preview branch; Vercel injects its `DATABASE_URL` for that preview deployment only | `pnpm vercel:build` → `db:migrate` then `next build` |
| **PR closed** | Preview Neon branch deleted (if cleanup enabled in integration) | — |
| **Merge to `main`** | Production `DATABASE_URL` (Neon `main`) | Same build on production deploy |

Locally you still use `.env.local` or Docker. CI uses `secrets.DATABASE_URL` or a stub (see `.github/workflows/ci.yml`).

**Dashboard setup (one-time):** [neon-vercel-setup.md](./neon-vercel-setup.md)

---

## Option A — Local Docker (no Neon admin)

```bash
pnpm run db:local:up
```

In `.env.local`:

```env
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
```

Apply schema:

```bash
pnpm run db:local:push
# first-time: pnpm run db:local:setup
```

- **Reset**: `pnpm run db:local:reset`
- **Stop**: `pnpm run db:local:down`

Local URLs use the `pg` driver; Neon URLs use the serverless HTTP driver (`src/db/connection.ts`).

---

## Option B — Neon branches (manual / shared dev)

Use this for local dev against a long-lived **`dev`** branch, or if preview branching is not enabled.

| Environment | Neon branch | `DATABASE_URL` |
|-------------|-------------|----------------|
| **Production** | `main` | Vercel → Production |
| **Preview** (without per-PR branching) | `dev` | Vercel → Preview (static) |
| **Local** | `dev` | `.env.local` |

### Create `dev` (Neon console)

1. [Neon Console](https://console.neon.tech) → **Branches** → **Create branch** → name `dev`, parent `main`.
2. Copy pooled connection string → `.env.local` as `DATABASE_URL`.

### Wire Vercel (production stays on `main`)

1. **Production** — `main` branch URL (unchanged).
2. **Preview** / **Development** — `dev` URL only if you are *not* using per-PR preview branching.

```bash
vercel env pull .env.local --environment=development
```

---

## Migrations

**Deployed environments (Vercel):** migrations run automatically in `vercel:build` via Drizzle SQL files in `src/db/migrations/`. Do not use `drizzle-kit push` on production.

**Local:**

```bash
pnpm db:migrate              # uses .env.local over .env
pnpm db:migrate -- --prod    # production .env only (local CLI)
pnpm db:generate             # after schema changes in src/db/schema
```

Workflow: change schema → `pnpm db:generate` → commit migration SQL → open PR (preview DB migrates on deploy) → merge (production migrates on deploy).

See [database-schema.md](./database-schema.md) for table reference.

---

## Quick check

```bash
node -e "const u=new URL(process.env.DATABASE_URL.replace(/^postgres:/,'postgresql:')); console.log(u.hostname, u.pathname)"
```

With `.env.local` loaded, or:

```bash
export $(grep -v '^#' .env.local | xargs) && node -e "..."
```
