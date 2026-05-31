# Neon + Vercel integration setup

One-time dashboard configuration for per-PR preview databases and automatic production migrations on merge.

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
| `NEON_PROJECT_ID` | Actions **variable** | Neon Console → Project → **Settings** |

Install the [Neon GitHub integration](https://neon.com/docs/guides/branching-github-actions) to create these automatically, or add them manually under **Settings → Secrets and variables → Actions**.

**Manual cleanup now:** Neon Console → **Branches** → delete stale `preview/…` branches (merge does not remove `main`).

## 5. Verify

1. Open a PR → wait for Vercel Preview → confirm deploy succeeds (migrations + build in logs).
2. In Neon Console → **Branches**, confirm a `preview/…` branch exists for the PR.
3. Merge to `main` → Production deploy runs migrations against `main`, then builds.
4. Close or merge the PR → `neon-preview-cleanup` workflow deletes the preview Neon branch (if secrets are set).

## Troubleshooting

- **Preview branch still there after merge** — Expected without the GitHub cleanup workflow or `NEON_API_KEY` / `NEON_PROJECT_ID`. See §4. Optionally shorten Vercel **Settings → Security → Deployment retention** for pre-production.
- **Build fails: DATABASE_URL is not set** — Neon integration not connected or preview branching disabled for that deployment.
- **Preview uses production data** — Preview branching off; static Preview `DATABASE_URL` may point at `main`. Enable per-preview branches.
- **Schema mismatch on preview** — Ensure migration SQL files are committed; `vercel:build` runs migrations before `next build`.

See also [database-environments.md](./database-environments.md).
