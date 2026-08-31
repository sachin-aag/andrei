# Autodiagnose production errors (Cursor fixes them)

When Vercel production fails, a Cursor cloud agent should **read the error,
decide if it is an application bug, pull PostHog / Langfuse / Neon, patch
the code, and open a draft PR**. This is not a wrapper SDK. Cursor is the
fixer. The Cloud Agents HTTP API is only a launch button.

Preview deploys are ignored so a broken feature branch is not auto-PR'd
onto `main`. Neon leftover-password (`28P01`) and canceled deploys are
ignored too.

## What is in the repo

| Piece | Role |
|-------|------|
| `.agents/skills/vercel-error-autodiagnose/SKILL.md` | Playbook the agent follows |
| `.cursor/automations/vercel-error-autodiagnose.md` | Prompt to paste into a Cursor Automation |
| `.github/workflows/vercel-error-autodiagnose.yml` | Backup trigger: GitHub `deployment_status` failure → Cloud Agents API |
| `src/lib/autodiagnose/` | Classifier, fingerprint, prompt (skip vs investigate) |
| `src/instrumentation.ts` `onRequestError` | Server 500s → PostHog + Langfuse so the agent has data |

## Recommended setup: Cursor Automation

Dashboard path. No SDK. PR creation is on by default for repo-backed
automations.

1. Open [cursor.com/automations](https://cursor.com/automations) → New.
2. Paste `.cursor/automations/vercel-error-autodiagnose.md`.
3. Repository: this repo, branch `main`. Enable pull-request creation.
4. Tools: Neon MCP, PostHog MCP, Memories. Langfuse keys belong in the
   **cloud environment** (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
   `LANGFUSE_HOST` or `LANGFUSE_BASE_URL`). Optional: `VERCEL_TOKEN`,
   `POSTHOG_PERSONAL_API_KEY` (only if MCP is not connected).
5. Add a **webhook** trigger. Save — Cursor shows the webhook URL + API key.
6. In each Vercel project (`andrei-v2`, `andrei-demo`, `andrei-convergent`):
   Settings → Webhooks → **Deployment Error** → that URL. Keep the Vercel
   signing secret on Vercel only.
7. Optional: a 15–30 min **schedule** for runtime exceptions that never
   fail a deploy (chat 500s, eval crashes). Memories store the last-seen
   fingerprint.

Private automations open PRs as your GitHub user. Team Owned opens them as
`cursor`. Promote only after MCP OAuth is on the team service account.

## Backup setup: GitHub Action + Cloud Agents API

Use this if you do not want to click the Automations UI, or as a second
trigger next to the webhook.

1. Cursor Dashboard → API Keys → create a user or service-account key.
2. GitHub repo → Settings → Secrets → `CURSOR_API_KEY`.
3. The workflow `.github/workflows/vercel-error-autodiagnose.yml` already
   runs on `deployment_status` failure, `repository_dispatch` type
   `vercel-error`, and `workflow_dispatch`.
4. Without `CURSOR_API_KEY` the job **succeeds and no-ops** (so forks and
   PRs from contributors are not red).

Manual test:

```bash
gh workflow run "Autodiagnose Vercel error" \
  -f error_text='Type error: src/lib/foo.ts(1,1): error TS2322' \
  -f environment=production \
  -f project_name=andrei-v2
```

This is a single `POST https://api.cursor.com/v1/agents` with
`autoCreatePR: true`. There is no extra TypeScript SDK in the app.

## Runtime errors (not just failed deploys)

Deploy webhooks only see **build / deployment.error**. Production 500s need
telemetry:

- **PostHog:** client `capture_exceptions` plus server `onRequestError`
  (`posthog-node`). Query `$exception` / error tracking.
- **Langfuse:** existing AI traces, plus `nextjs.request_error` spans.
- **Schedule or Slack:** point the same Cursor Automation at those sources.

A Vercel log drain that POSTs every 5xx at the Cursor webhook will also
work; keep it production-only or the classifier will skip previews.

## Classifier (what does *not* get a PR)

`src/lib/autodiagnose/classify.ts` is the gate:

| Signal | Action |
|--------|--------|
| Canceled / superseded deploy | Skip |
| Neon `28P01` / password authentication failed | Skip (infra) |
| `DATABASE_URL is not set`, missing env | Skip (infra) |
| Gemini/Vertex/AI Gateway 429/quota | Skip (third party) |
| Preview / staging | Skip |
| TypeScript / `Failed to compile` | Investigate + fix |
| `column/relation does not exist`, SQL syntax | Investigate + fix |
| `FUNCTION_INVOCATION_FAILED`, TypeError, HTTP 500 | Investigate + fix |

Duplicates are keyed by `autodiagnose-fingerprint:` (normalized message,
no deployment ids). The Action also writes that marker as a commit comment
so three customer projects failing the same SHA only launch one agent.

## Secrets cheat sheet

| Where | Name | Purpose |
|-------|------|---------|
| GitHub Actions | `CURSOR_API_KEY` | Launch cloud agents from the workflow |
| Cursor env / Automation | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | Trace lookup |
| Cursor env / Automation | Langfuse host | `LANGFUSE_HOST` or `LANGFUSE_BASE_URL` |
| Cursor MCP | Neon | Read-only project/SQL |
| Cursor MCP | PostHog | Exceptions, recordings, HogQL |
| Optional Cursor env | `VERCEL_TOKEN` | `vercel inspect --logs` |
| Vercel (already) | `NEXT_PUBLIC_POSTHOG_KEY` | Client + server exception capture |

Do not put Cursor or Langfuse secrets in Vercel **preview** env just for
this loop. The agent runs in Cursor's cloud, not in Next.js.

## Related

- `docs/neon-vercel-setup.md` — `28P01` leftover preview password
- `docs/whitelabel-vercel-deploy.md` — three Vercel projects, one SHA
- `.agents/skills/langfuse` — CLI for traces
- PostHog error-tracking skill (Cursor plugin) — issue investigation
