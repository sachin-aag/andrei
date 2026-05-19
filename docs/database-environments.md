# Database environments

The app uses a single env var: **`DATABASE_URL`**. Point it at different databases per environment so production data stays isolated from experiments (suggested fixes, migrations, etc.).

## Option A — Local Docker (tonight, no Neon admin)

Best when you do not have Neon console access.

```bash
npm run db:local:up
```

In `.env.local`:

```env
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
```

Apply schema (use `--force` on an empty DB so drizzle-kit does not skip or prompt):

```bash
pnpm run db:local:push
# first-time one-liner: pnpm run db:local:setup
# or full ensure: pnpm run db:ensure
```

Start the app:

```bash
npm run dev
```

- **Empty DB** — good for schema work; seed reports by creating them in the UI.
- **Reset** (wipe volume): `npm run db:local:reset`
- **Stop**: `npm run db:local:down`

Local URLs use the `pg` driver; Neon URLs use the serverless HTTP driver (see `src/db/connection.ts`).

---

## Option B — Neon branches (when you have Neon or Vercel admin)

Neon **branches** are copy-on-write clones: each branch has its own connection string. Free tier includes branching.

### Recommended layout

| Environment | Neon branch | Where `DATABASE_URL` is set |
|-------------|-------------|-------------------------------|
| **Production** | `main` (existing) | Vercel → Production |
| **Preview / PRs** | `dev` or per-PR preview branch | Vercel → Preview |
| **Local dev** | `dev` (same as preview) | `.env.local` |

Production keeps the database you use today. Local and preview deployments use a **dev** branch so migrations and AI experiments never touch live reports.

### Create a dev branch (Neon console)

1. [Neon Console](https://console.neon.tech) → your project → **Branches**.
2. **Create branch** → name `dev` → parent `main` (includes current data at branch time).
3. Open the `dev` branch → **Connection details** → copy the **pooled** `postgresql://…` URL.
4. Put that URL in `.env.local` as `DATABASE_URL`.

### Wire Vercel (keeps production on `main`)

1. Vercel project → **Settings** → **Environment Variables**.
2. **Production** — leave `DATABASE_URL` as the existing `main` branch string (do not change).
3. **Preview** and **Development** — set `DATABASE_URL` to the `dev` branch connection string.
4. Redeploy or open a new preview.

Pull env locally:

```bash
vercel env pull .env.local --environment=development
# Preview branch URL:
vercel env pull .env.preview --environment=preview
```

You need Vercel project access, not necessarily Neon admin, if a teammate already added the dev branch URL to Preview/Development.

### CLI (if you have a Neon API key)

```bash
npm i -g neonctl
neonctl auth
neonctl branches create --name dev --project-id <project-id>
neonctl connection-string dev
```

---

## Option C — Neon without branching

If branching is blocked, use a **second Neon project** (or database) for dev and keep the current URL only on Vercel Production. Same env-var pattern as Option B.

---

## Migrations

All environments share the same Drizzle schema:

```bash
npm run db:push          # dev schema sync
npm run db:ensure        # comment columns + suggested_fix + push
```

Run migrations against **dev/local first**, then production after review.

---

## Quick check

```bash
# Which host is configured? (does not print password)
node -e "const u=new URL(process.env.DATABASE_URL.replace(/^postgres:/,'postgresql:')); console.log(u.hostname, u.pathname)"
```

Run with `.env.local` loaded, or:

```bash
export $(grep -v '^#' .env.local | xargs) && node -e "..."
```
