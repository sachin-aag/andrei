# Andrei whitelabel — separate Vercel + Neon deployment

Deploy `feat/whitelabel` as a **standalone demo** (Andrei branding) without touching production MJ on `andrei-v2` / `main`.

## Architecture

| | Production (MJ) | Whitelabel demo |
|--|-----------------|-----------------|
| **Vercel project** | `andrei-v2` | `andrei-demo` |
| **Git production branch** | `main` | `feat/whitelabel` |
| **URL** | https://andrei-v2.vercel.app | https://andrei-demo.vercel.app |
| **Neon project** | `Andrei V2` | **`demo`** (separate project) |
| **Neon branch** | `main` / production | `production` (default) |
| **Data** | Real workspace | Isolated demo DB (seed script) |

Both Vercel projects use the same GitHub repo (`sachin-aag/andrei`) and build command (`pnpm vercel:build` → migrate + build). Schema is applied independently per deploy — no Neon-side schema merge.

**Why a separate Neon project (not a branch on prod)?** The demo is a permanent second product with its own reports and no plan to merge data. A dedicated Neon project gives hard isolation (credentials, console, quotas) and avoids preview-branch cleanup touching demo data.

## Already done

- [x] `feat/whitelabel` pushed to GitHub
- [x] Vercel project **`andrei-demo`** created and GitHub-connected
- [x] Neon project **`demo`** (`bold-field-45608643`) — schema pushed, migrations baselined, 5 reports seeded
- [x] Production env vars on `andrei-demo` (demo `DATABASE_URL`, `AUTH_URL`, AI/auth keys from local `.env`)
- [x] Initial production deploy → https://andrei-demo.vercel.app
- [x] Vercel Authentication (SSO) disabled on `andrei-demo` for public client access

## Fresh Neon project bootstrap

Historical SQL migrations assume a DB that was originally created with `drizzle-kit push` (prod path). On a **brand-new empty** Neon project, `pnpm db:migrate` alone can fail mid-chain. One-time bootstrap:

```bash
export DATABASE_URL='postgresql://…demo…?sslmode=require'

# 1. Apply current schema from src/db/schema
pnpm exec drizzle-kit push --force

# 2. Mark existing migration files as applied (so vercel:build migrate is a no-op)
node --input-type=module -e "
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const dir = path.join(process.cwd(), 'src/db/migrations');
const journal = JSON.parse(fs.readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query('CREATE SCHEMA IF NOT EXISTS drizzle');
await pool.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
for (const entry of journal.entries) {
  const sql = fs.readFileSync(path.join(dir, entry.tag + '.sql'), 'utf8');
  const hash = crypto.createHash('sha256').update(sql).digest('hex');
  await pool.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT \$1, \$2 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = \$1)', [hash, entry.when]);
}
const extra = '0030_conclusion_section';
const sql = fs.readFileSync(path.join(dir, extra + '.sql'), 'utf8');
const hash = crypto.createHash('sha256').update(sql).digest('hex');
await pool.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT \$1, \$2 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = \$1)', [hash, Date.now()]);
await pool.end();
console.log('Baselined');
"

# 3. Seed demo users + reports
pnpm seed-demo-reports
```

After bootstrap, `pnpm vercel:build` migrations on deploy stay safe.

## Still required (one-time dashboard)

### Production branch — **yes, if you use git auto-deploy**

`andrei-demo` currently tracks **`main`** for Production. That means:

| Production branch | What deploys `andrei-demo` on git push |
|-------------------|----------------------------------------|
| `main` (current) | Only pushes to **`main`** — **not** `feat/whitelabel` |
| `feat/whitelabel` | Only pushes to **`feat/whitelabel`** — your fork model |

**You need this step** if you want `git push origin feat/whitelabel` to deploy the demo without a manual `vercel deploy --prod`. It does **not** affect `andrei-v2` (that project still tracks `main`).

**Skip it** only if you will **always** deploy via CLI (`vercel link -p andrei-demo && vercel deploy --prod`) and never rely on GitHub hooks for the demo.

[andrei-demo → Settings → Environments → Production → Branch Tracking](https://vercel.com/sachin-aags-projects/andrei-demo/settings/environments) → set to **`feat/whitelabel`**.

### Framework preset

In [andrei-demo → Settings → General](https://vercel.com/sachin-aags-projects/andrei-demo/settings/general), set **Framework Preset** to **Next.js**. If left as "Other", the build can succeed but routes may not be wired (404 on all paths). CLI:

```bash
vercel api /v9/projects/andrei-demo -X PATCH -F framework=nextjs
```

Then redeploy: `vercel deploy --prod --yes` (from `feat/whitelabel`).

## Neon `demo` project

| Field | Value |
|-------|--------|
| Console | https://console.neon.tech/app/projects/bold-field-45608643 |
| Database | `neondb` |
| Default branch | `production` |
| Pooled host | `…-pooler.c-3.us-east-1.aws.neon.tech` |
| Direct host | `….c-3.us-east-1.aws.neon.tech` (for `DATABASE_URL_UNPOOLED`) |

Connection strings: Neon Console → **demo** → **Connect**. Do not commit passwords to git.

## 1. Vercel — production branch

[andrei-demo → Settings → Environments → Production → Branch Tracking](https://vercel.com/sachin-aags-projects/andrei-demo/settings/environments)

1. Change **Production Branch** from `main` to **`feat/whitelabel`**
2. Save

Until this is set, pushes to `main` would incorrectly deploy MJ code to `andrei-demo`.

## 2. Vercel — environment variables (Production)

[andrei-demo → Settings → Environment Variables](https://vercel.com/sachin-aags-projects/andrei-demo/settings/environment-variables)

Copy from **`andrei-v2` Production**, then override:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Neon **`demo`** project — pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon **`demo`** project — direct (non-pooler) connection string |
| `AUTH_URL` | `https://andrei-demo.vercel.app` |
| `AUTH_SECRET` | Unique secret per deployment (`openssl rand -base64 32`) |

Also set for **Production** (copy from `andrei-v2` if missing):

- `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`
- `AI_GATEWAY_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`)
- `LANGFUSE_*` (optional)
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (optional; separate PostHog project recommended)
- `SITE_ACCESS_PASSWORD` (if you use the site gate)
- GCP / Vertex vars if AI uses Vertex on production

**Do not** set `ALLOW_TEST_*` or `TEST_AUTH_EMAIL` on Production.

### Neon ↔ Vercel integration

Connect the **`demo`** Neon project to **`andrei-demo`** only (Vercel **Storage** → Neon). Do **not** reuse the `Andrei V2` Neon integration for the demo app.

For Production, explicit `DATABASE_URL` env vars override integration defaults. **Disable** per-preview Neon branching on `andrei-demo` unless you want ephemeral PR databases — a static `DATABASE_URL` is simpler for a stable client demo.

CLI example (after `vercel link -p andrei-demo -y`):

```bash
printf '%s' 'postgresql://…pooled…' | vercel env add DATABASE_URL production
printf '%s' 'postgresql://…direct…'  | vercel env add DATABASE_URL_UNPOOLED production
printf '%s' 'https://andrei-demo.vercel.app' | vercel env add AUTH_URL production
printf '%s' "$(openssl rand -base64 32)" | vercel env add AUTH_SECRET production
```

## 3. Deploy

**Git (after env vars + production branch are set):**

```bash
git push origin feat/whitelabel
```

**CLI one-off:**

```bash
vercel link -p andrei-demo -y
vercel deploy --prod --yes
vercel link -p andrei-v2 -y   # restore local link
```

Build runs `pnpm vercel:build` (migrations + `next build`). Migrations are idempotent on an already-migrated DB.

## 4. Seed / refresh demo data

Against the **`demo`** Neon URL (local or CI):

```bash
DATABASE_URL='postgresql://…demo…?sslmode=require' pnpm seed-demo-reports
```

Creates (idempotent on deviation numbers):

- `engineer@company.com` / `manager@company.com` — **`DemoPass123!`** (`mustChangePassword` on first login)
- 5 reports: `DEV-2026-001` … `005`

Re-run after schema changes or to reset demo content (delete reports in Neon SQL editor first if you need a clean slate).

## 5. Verify

1. https://andrei-demo.vercel.app → Andrei branding
2. Login `engineer@company.com` → 5 seeded reports
3. Measure experiment fields + **Conclusion** section
4. Export DOCX → Andrei header/logo
5. **Insights** nav → mock pages
6. Run AI Check (needs `AI_GATEWAY_API_KEY` or Gemini on Production)

## 6. Custom domain (optional)

[andrei-demo → Domains](https://vercel.com/sachin-aags-projects/andrei-demo/settings/domains) — e.g. `demo.andreihealth.com`, then update `AUTH_URL`.

## Keeping environments in sync

| Change | Action |
|--------|--------|
| Whitelabel features | Commit to `feat/whitelabel` → deploys `andrei-demo` |
| MJ production | Merge to `main` → deploys `andrei-v2` only |
| New migration SQL | Commit → each Vercel project migrates its own Neon DB on deploy |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL is not set` on build | Add demo pooled URL to **Production** on `andrei-demo` |
| Wrong login redirect | `AUTH_URL` must match deployed URL exactly |
| **404 on all paths** | Set Framework Preset to **Next.js** on `andrei-demo`, then redeploy |
| Empty dashboard | Run `pnpm seed-demo-reports` against **demo** Neon |
| MJ branding on demo | Production branch still `main`; set to `feat/whitelabel` |
| Prod data on demo | `DATABASE_URL` points at wrong Neon project — must be **`demo`**, not `Andrei V2` |
| AI Check errors | Add AI gateway / Gemini key to Production |

## Local `.vercel` link

Keep `.vercel` linked to **`andrei-v2`** for day-to-day dev. Use `vercel link -p andrei-demo -y` only for demo deploys or env management.
