---
name: vercel-error-autodiagnose
description: >-
  Diagnose a Vercel production error, decide if it is an application bug,
  pull PostHog / Langfuse / Neon evidence, fix the code, and open a draft PR.
  Use when a Vercel deploy failed, a production 500 appeared, a Cursor
  Automation webhook fired, or the autodiagnose GitHub Action launched this
  agent.
---

# Vercel error → Cursor fix PR

You are here to **fix a production bug in this repo**, not to wrap another SDK
and not to file a ticket. If the error is a real application defect, change
the code and open a **draft** pull request. If it is infra, a canceled deploy,
or an upstream outage, stop and do not open a PR.

## Do this in order

1. **Classify** using `src/lib/autodiagnose/classify.ts` rules (or re-read the
   error text). Skip when:
   - the deploy was canceled / superseded
   - Neon `28P01` / leftover preview password (see `docs/neon-vercel-setup.md`)
   - missing `DATABASE_URL` or other env
   - Gemini / Vertex / AI Gateway quota, 429, 401, 403
   - preview/staging (do not PR a feature branch onto `main`)
2. **Dedup.** Search open PRs and commit comments for
   `autodiagnose-fingerprint: <id>`. If one exists, stop.
3. **Pull evidence** (fail-soft — missing MCP is not a reason to skip a clear
   compile error):
   - **PostHog** — `$exception` events, error-tracking issues, session replay.
   - **Langfuse** — traces/observations with errors around the timestamp.
   - **Neon** — read-only SQL / project status. No writes.
   - **Vercel** — build or runtime logs if `VERCEL_TOKEN` is available.
4. **Fix** the smallest application change. Add or update colocated tests.
5. **Open a draft PR** targeting `main`. Include the fingerprint HTML comment,
   diagnosis, evidence links (no emails), and the human tester checklist.
   Do not merge. Do not push to `main`.

## PostHog

PostHog EU project (`NEXT_PUBLIC_POSTHOG_KEY`, host `https://eu.posthog.com`).
Browser events go through the first-party `/mj-sync` proxy; server
`onRequestError` uses `posthog-node` directly.

When the PostHog MCP is available:

- `query-error-tracking-issue` / `query-error-tracking-issue-events` if you
  have an issue id
- `execute-sql` for `$exception` around the failure time
- `query-session-recordings-list` when a `$session_id` is present

If MCP is unauthenticated, use a personal API key only when it is already in
the environment (`POSTHOG_PERSONAL_API_KEY`). Never print the key.

Look for:

```sql
SELECT
    timestamp,
    properties.$exception_type AS type,
    properties.$exception_message AS message,
    properties.$exception_issue_id AS issue_id,
    properties.$current_url AS url,
    properties.$session_id AS session_id
FROM events
WHERE event = '$exception'
    AND timestamp > now() - INTERVAL 6 HOUR
ORDER BY timestamp DESC
LIMIT 50
```

Redact emails, names, and report contents from the PR. Cite issue ids and
stack frames instead.

Client autocapture is `posthog.startExceptionAutocapture()` in
`src/providers/posthog-provider.tsx`. Server errors land via
`onRequestError` in `src/instrumentation.ts`.

## Langfuse

Keys: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` or
`LANGFUSE_BASE_URL`. Use `npx langfuse-cli` (see `.agents/skills/langfuse`).

```bash
npx langfuse-cli api traces list --from <ISO timestamp minus 30m> --limit 50
```

Filter to ERROR / chat / evaluate / suggestions / ingest. In OTEL-instrumented
traces, content often lives on a GENERATION observation, not the trace I/O.

Unhandled Next.js request errors also create an OTEL span named
`nextjs.request_error`.

## Neon

This app has three customer projects (`andrei-v2`, `andrei-demo`,
`andrei-convergent`). Use the Neon MCP read-only. `28P01` is **not** a code
bug — delete the leftover `preview/…` branch and redeploy.

Do not run `pnpm db:push` against production. Do not disable preview
branching.

## Vercel

Three projects, same git SHA:

| Project | Pack | Production host |
|---------|------|-----------------|
| `andrei-v2` | mj | https://mj.andreihealth.com |
| `andrei-demo` | demo | https://demo.andreihealth.com |
| `andrei-convergent` | convergent | https://convergent.andreihealth.com |

If `VERCEL_TOKEN` is present:

```bash
vercel inspect <deployment-url> --logs
vercel logs --deployment <id> --level error
```

Do not set `ALLOW_TEST_*` on Vercel.

## PR shape

- Draft, targeting `main`
- Body includes `<!-- autodiagnose-fingerprint: <id> -->`
- CEO fold + Summary + Test plan
- Diagnosis section: what failed, which file, PostHog/Langfuse/Neon links
- No secrets, no customer PHI, no full prompts with report text
