# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js 16 app (M.J. Biopharm Investigation Report Tool). Standard
commands live in `CLAUDE.md`, `README.md`, and `package.json` scripts — use those for
lint/test/build/run. The notes below cover only non-obvious, durable setup/run caveats
for this environment.

### Services

- **Next.js dev server** — the product. Run `pnpm dev` (http://localhost:3000, Turbopack).
- **PostgreSQL 16** — required; all report/section/eval/comment/user data persists here.
  Installed natively (not Docker). It is **not** auto-started on boot, so start it before
  running the app or DB scripts:

  ```bash
  sudo pg_ctlcluster 16 main start
  ```

  Connection is configured in `.env.local` as
  `postgresql://andrei:andrei@127.0.0.1:5432/andrei_dev`. Because the host is `127.0.0.1`,
  `src/db/connection.ts` uses the `pg` driver (not the Neon HTTP driver).

### Database schema & users (local Postgres gotchas)

- Apply/refresh schema with **`pnpm db:local:push`** (runs `drizzle-kit push --force`).
  The plain `pnpm db:push` prompts interactively and **fails in non-interactive shells**
  ("Interactive prompts require a TTY").
- The Neon-driver maintenance scripts (e.g. `pnpm db:ensure-workspace-users`) target the
  Neon HTTP API and **do not work against local Postgres** (they try to fetch
  `https://api.0.0.1/sql`). Not needed locally — `db:local:push` already creates all tables.
- Create a login user (the `set-workspace-password` script uses the `pg` driver, so it
  works locally). The email must be `@mjbiopharm.com`:

  ```bash
  pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
  ```

  The account is flagged `mustChangePassword`, so first login forces a one-time password
  change before reaching the dashboard.

### Turbopack dev route-registration gotcha

In `pnpm dev`, a newly-hit API route handler can occasionally fail to register on its
first on-demand compile and return Next's **HTML 404 page** (instead of the handler's
JSON) for every method. Symptom seen here: editor auto-save `PATCH
/api/reports/<id>/sections/<section>` returned `404 text/html` even though the report
existed. Fix: restart the dev server (optionally `rm -rf .next` first); the route then
serves normally (PATCH/POST → 200). This is a dev-server state issue, not a code bug.

### AI features

AI evaluation/suggestions need a Gemini credential (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`
or `AI_GATEWAY_API_KEY`), which is not configured here. Core flows — login, report
CRUD, the DMAIC editor with auto-save, manager review, and DOCX export — work without it.
"Run AI Check" / suggestions will error until a credential is added to `.env.local`.

### Tests

- Unit tests (`pnpm test`, Vitest) mock env per-test and need no DB or external services.
- E2E (`pnpm test:e2e`, Playwright) needs a reachable Postgres at the configured
  `DATABASE_URL` and spins up its own dev server; it sets test-only bypass env vars.
