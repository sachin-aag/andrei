# Neon + Vercel integration setup

**Customer projects:** `andrei-v2`, `andrei-demo`, and `andrei-convergent` keep **Create a branch for each preview deployment** **on**. Each git ref gets an isolated Neon `preview/<git-branch>` database. Production stays on the project's default Neon branch. See [whitelabel-vercel-deploy.md](./whitelabel-vercel-deploy.md).

A leftover password from a deleted preview compute fails `vercel:build` with `28P01`. Delete that Neon `preview/…` branch and redeploy so Neon injects a fresh URL. Do not turn preview branching off, and do not hand-edit Neon-logo `DATABASE_URL` rows.

## Prevent preview `28P01` failures (checklist)

Work through this once per Vercel project (`andrei-v2`, `andrei-demo`, `andrei-convergent`). Most repeat failures come from missing cleanup credentials or preview branches left behind after bot/force-push deploys.

### 1. Keep preview branching on (do not disable)

1. Vercel project → **Storage** → Neon database → **Deployments configuration**.
2. Confirm **Create a branch for each preview deployment** is **on**.
3. Enable **Delete branch when preview deployment is removed** when offered.

### 2. GitHub Actions cleanup (all three Neon projects)

Every git ref builds on **all three** Vercel projects, so each ref can create a `preview/<git-branch>` in **three** Neon projects. Configure GitHub **Settings → Secrets and variables → Actions**:

| Name | Type | Value |
|------|------|--------|
| `NEON_API_KEY` | Secret | Neon Console → Account → **API keys** |
| `NEON_PROJECT_ID_MJ` | Variable | Andrei V2 project id (`andrei-v2`) |
| `NEON_PROJECT_ID_DEMO` | Variable | `bold-field-45608643` |
| `NEON_PROJECT_ID_CONVERGENT` | Variable | `cold-thunder-36255681` |

Legacy repos may only have `NEON_PROJECT_ID` (MJ). Add the `_MJ` / `_DEMO` / `_CONVERGENT` variables so [`.github/workflows/neon-preview-cleanup.yml`](../.github/workflows/neon-preview-cleanup.yml) and [`.github/workflows/neon-preview-stale-cleanup.yml`](../.github/workflows/neon-preview-stale-cleanup.yml) clean all three.

- **On PR close:** `neon-preview-cleanup` deletes `preview/<git-branch>` (and `preview/pr-<n>-<git-branch>` fallback).
- **Weekly:** `neon-preview-stale-cleanup` deletes `preview/*` branches older than 14 days (manual **Run workflow** to override age).

### 3. Vercel build-time auto-heal (optional but recommended)

Add the **same** Neon credentials to each Vercel project's **Preview** environment (not Production):

| Variable | Preview value |
|----------|----------------|
| `NEON_API_KEY` | Same API key as GitHub |
| `NEON_PROJECT_ID` | That project's Neon id (MJ / demo / convergent) |

On `28P01`, `pnpm vercel:build` deletes the stale `preview/<git-branch>` via the Neon API and logs **Redeploy this Vercel Preview**. Click **Redeploy** on the failed deployment (no new commit) so Neon injects a fresh `DATABASE_URL`.

### 4. Shorten preview deployment retention

Vercel → **Settings → Security → Deployment retention** → shorten **Pre-Production** retention so old preview deployments (and their Neon rows) are removed sooner.

### 5. Fix a failed preview deploy right now

1. Neon Console → **Branches** → delete `preview/<git-branch>` for the failing ref (and any `preview/pr-…` variant).
2. Vercel → failed Preview deployment → **Redeploy** (or push an empty commit).
3. If auto-heal is configured, step 1 may already run in the build log — you only need **Redeploy**.

One-time dashboard configuration for per-git-branch preview databases and automatic production migrations on merge.

## Prerequisites

- Neon project linked to the Vercel project (Vercel **Storage** → Neon, or Neon **Integrations** → Vercel).
- Production `DATABASE_URL` already set on Vercel **Production** environment (Neon `main` branch).

## 1. Enable preview branching

### Vercel-managed Neon

1. Vercel project → **Storage** → your Neon database → **Connect** (if not already).
2. Under **Deployments configuration** (or **Advanced options**), enable **Create a branch for each preview deployment** (Preview Branching).
3. Enable **Delete branch when preview deployment is removed** (or equivalent cleanup) if offered.

### Neon-managed integration

1. [Neon Console](https://console.neon.tech) → **Integrations** → **Vercel** → connect the Vercel project.
2. Enable **Create a database branch for each preview deployment**.
3. Enable automatic cleanup when the Git branch / preview is deleted.

## 2. Environment variables

| Vercel environment | `DATABASE_URL` source |
|--------------------|------------------------|
| **Production** | Neon `main` branch (set in Vercel env vars; do not change unless intentional) |
| **Preview** | Injected per deployment by Neon (not a static Preview env var) |
| **Development** | Optional: shared `dev` branch URL for `vercel env pull` locally |

Preview deployments receive a **deployment-specific** `DATABASE_URL` at build/runtime. You typically will not see that URL in **Settings → Environment Variables** for Preview.

## 3. Build command (repo)

This repo uses `pnpm vercel:build` (configured in `vercel.json`), which:

1. Runs `pnpm db:migrate` against whatever `DATABASE_URL` Vercel/Neon injected for that deployment.
2. Runs `next build`.

No separate GitHub Action is required to create or delete Neon preview branches.

## 4. Immediate cleanup on PR close (recommended)

Merging or closing a PR does **not** delete the Neon preview branch right away with integration-only cleanup:

| Integration | When the preview Neon branch is removed |
|-------------|----------------------------------------|
| **Vercel-managed** | When Vercel **deletes** the preview deployment (default retention can be **months**) |
| **Neon-managed** | When the Git branch is gone and **another** preview deploy runs (not on merge alone) |

This repo adds [`.github/workflows/neon-preview-cleanup.yml`](../.github/workflows/neon-preview-cleanup.yml) to delete the branch when a PR closes.

**GitHub repository settings (required for that workflow):**

| Name | Type | Where to get it |
|------|------|-----------------|
| `NEON_API_KEY` | Actions **secret** | Neon Console → Account → **API keys** |
| `NEON_PROJECT_ID_MJ` | Actions **variable** | Andrei V2 → Project → **Settings** |
| `NEON_PROJECT_ID_DEMO` | Actions **variable** | `bold-field-45608643` |
| `NEON_PROJECT_ID_CONVERGENT` | Actions **variable** | `cold-thunder-36255681` |

`NEON_PROJECT_ID` (no suffix) is still read as a legacy MJ fallback. Prefer the three suffixed variables so demo and convergent preview branches are cleaned too.

Install the [Neon GitHub integration](https://neon.com/docs/guides/branching-github-actions) to create these automatically, or add them manually under **Settings → Secrets and variables → Actions**.

**Manual cleanup now:** Neon Console → **Branches** → delete stale `preview/…` branches (merge does not remove `main`).

## 5. Verify

1. Open a PR → wait for Vercel Preview → confirm deploy succeeds (migrations + build in logs).
2. In Neon Console → **Branches**, confirm a `preview/…` branch exists for the PR.
3. Merge to `main` → Production deploy runs migrations against `main`, then builds.
4. Close or merge the PR → `neon-preview-cleanup` workflow deletes the preview Neon branch (if secrets are set).

## Troubleshooting

- **Preview branch still there after merge** — Expected without the GitHub cleanup workflow or `NEON_API_KEY` / `NEON_PROJECT_ID_*`. See §4 and **Prevent preview `28P01` failures** above. Optionally shorten Vercel **Settings → Security → Deployment retention** for pre-production.
- **Build fails: DATABASE_URL is not set** — Preview branching is off or the inject raced the first compile. Enable **Create a branch for each preview deployment**, then redeploy.
- **Build fails: 28P01 / password authentication failed** — Stale password for a deleted preview compute. Keep preview branching **on**. Delete Neon `preview/<git-branch>` (and leftover `preview/…` for that ref), then **Redeploy** the Vercel Preview. If `NEON_API_KEY` + `NEON_PROJECT_ID` are set on the Vercel project Preview env, the build log may already delete the branch — redeploy only. Do not hand-edit Neon-logo `DATABASE_URL` rows.
- **Preview uses production data** — Preview branching is off, or a static Preview `DATABASE_URL` is the Production row. Turn preview branching **on** so Neon injects `preview/<git-branch>`.
- **Schema mismatch on preview** — Ensure migration SQL files are committed; `vercel:build` runs migrations before `next build`.

See also [database-environments.md](./database-environments.md).
