---
name: pr-human-tester-checklist
description: >-
  Writes a CEO plain-language fold, a detailed PR Summary, and a living
  GitHub task-list of human tester steps, tagged CEO (taste / experience)
  or CTO (technical; CTO tests all). Use whenever creating, opening, editing,
  or updating a PR, running gh pr create / gh pr edit, pushing commits to a
  branch that already has an open PR, drafting a test plan, merge checklist,
  QA steps, CEO vs CTO testing, or pre-merge human testing notes.
license: MIT
metadata:
  author: project
  version: "1.3.0"
---

# PR human tester checklist

Every PR description must include, in this order:

1. A **collapsed** “What's new (plain language)” fold for the CEO
2. A **detailed Summary** for reviewers
3. A **Test plan** of GitHub task-list items (`- [ ]` / `- [x]`)

Keep all three current whenever the PR changes.

The Test plan is what a **human** should do on the preview (or local)
**before merging**. This is not CI. Do not list `pnpm test`, lint, typecheck,
or “wait for GitHub Actions”.

For item-writing examples and CEO-fold copy, see [examples.md](examples.md).

## When (always)

Run this skill, then write or refresh the CEO fold, Summary, and Test plan,
whenever you:

1. `gh pr create`
2. `gh pr edit` (title or body)
3. Push new commits to a branch that already has an **open** PR
4. Are asked to open, update, or ship a PR

If a PR already exists for the branch, refresh even if the user only asked
to push. Do not leave a stale fold, Summary, or checklist.

## Workflow

1. Inspect the **current** diff vs the PR base (`git diff origin/<base>...HEAD`
   and changed paths). Derive tester steps from **user-visible behavior**, not
   from file names.
2. Load the existing PR body if any:

   ```bash
   gh pr view --json body,url,title,baseRefName
   ```

3. Rebuild the **CEO fold** from the current diff (see
   [CEO plain-language fold](#ceo-plain-language-fold)).
4. Rebuild **Summary** from the current diff (see [Summary](#summary)). Do not
   leave a one-line restatement of the title.
5. Build a new Test plan from the diff (see [What to include](#what-to-include)).
6. Preserve `- [x]` for items that still apply (see [Preserve checkmarks](#preserve-checkmarks)).
7. Write the body: create with fold + Summary + Test plan, or replace those
   sections in the existing body (see [Body contract](#body-contract)).
8. Confirm GitHub parsed the tasks (`gh pr view --json body` still contains
   `- [ ]` / `- [x]` lines under Test plan).

Never mark items done yourself unless the user said they completed that step.

## Body contract

This skill owns the CEO fold, `## Summary`, and the Test plan. Refresh all
three from the current diff. Keep only content **after**
`<!-- human-tester-checklist:end -->` (human notes). Do not leave a stale
one-line Summary or a missing CEO fold.

```markdown
<details>
<summary>What's new (plain language)</summary>

For the CEO / anyone who will not read the diff.

- …
- …

</details>

## Summary

<2–4 sentences: what was wrong or missing, what this PR changes, who it
affects (engineer / manager / both document types).>

- **User-facing:** what someone notices in the product (or “none — plumbing”).
- **How it works:** the mechanism in plain language (tools, queue, retrieval).
- **Ops / risk:** migrations, prompt-version bumps, env, allowlists — omit if none.

<!-- human-tester-checklist:start -->
## Test plan

Do these on the Vercel preview (or local) before merging. Tick items here;
GitHub tracks progress on the PR.

**CTO** tests every item. **CEO** tests only items marked **CEO** (product
direction, taste, or experience). Items marked **CTO** are technical-only.

- [ ] **CEO** — …
- [ ] **CTO** — …
<!-- human-tester-checklist:end -->
```

- The CEO fold is **always present** and **collapsed** (`<details>`, no
  `open` attribute). Put a blank line after `</summary>` so GitHub renders
  markdown inside the fold.
- Never put `- [ ]` / `- [x]` inside the fold. Checkboxes belong only in
  Test plan (GitHub task tracking is unreliable inside `<details>`).
- Use a **flat** list in Test plan (no nested checkboxes). Nested items
  often do not count toward the PR task progress.
- Prefix every Test plan item with **`CEO`** or **`CTO`** (see
  [Who tests](#who-tests)). Do not split into two lists.
- One action per item. Typical size: **3–8** items. Fewer is fine for a tiny
  change; more only when several distinct surfaces changed.
- Do not duplicate the same Test plan elsewhere in the body.
- When splicing: replace from the opening `<details>` (or `## Summary` if
  the fold is missing, or the start of the body) through
  `<!-- human-tester-checklist:end -->`. If sentinels are missing, replace
  through the end of `## Test plan` (next `## ` or EOF). Preserve any text
  after the end sentinel.

`gh pr edit --body-file` (or `--body`) after a HEREDOC. Do not use
`gh pr create` without this section.

## CEO plain-language fold

Write for someone who will not open the diff or the Summary bullets. This is
**not** a restatement of Summary with the jargon stripped in place — it is a
shorter, product-only account of what a user will notice.

Required shape:

1. Opening `<details>` / `<summary>What's new (plain language)</summary>`
2. One line: `For the CEO / anyone who will not read the diff.`
3. **2–5 short bullets** (or 2–4 sentences) in everyday language

Rules:

- No function names, file paths, prompt versions, SQL, migrations,
  allowlists, env vars, or mode internals (`ask_user`, `draft_field`).
- Product nouns are fine: Assistant, attachments, draft cards, engineer,
  manager.
- Ground every claim in the diff. Do not invent UI.
- Always include the fold. Plumbing/docs-only: one bullet —
  `Nothing in the product looks different. Internal change only.`

## Summary

Write for a reviewer who will not open the diff. Ground every claim in the
changed code — do not invent product behavior.

Required shape:

1. **Lead (2–4 sentences).** Problem or gap → what changed → who feels it.
   Not a restatement of the PR title. Not a file list.
2. **Bullets (3–6).** Concrete pieces: user-visible behavior first, then
   mechanism, then ops. Name tools, modes (Plan/Agent), document types, and
   prompt/migration versions when they changed.
3. **Ops / risk** only when merge needs it (SQL migration, prompt bump,
   Plan-mode allowlist, env). Skip the bullet if there is nothing to do.

Too thin (do not ship):

> Search attachments before asking. Also update docs.

Thick enough:

> Engineers were asked for batch numbers and dates even when those facts were
> already in attached PDFs. Plan mode led with `ask_user`. This PR makes
> report chat attachment-first: search (and a kickoff evidence preview)
> before asking, and only ask for what the documents do not contain.

If the PR is docs-only or plumbing-only, say that in the lead, then still
explain *what* moved and *why* (not “misc cleanup”).

## What to include

Write steps a teammate can follow without reading the diff. Prefer:

- **Who:** `engineer` / `manager` / `admin` / `qa` when the change is
  role-specific
- **Where:** page or control (report editor, chat, attachments, AI Check,
  review rail, admin, login, export)
- **What to do:** click, type, upload, submit
- **What to see:** the expected result

## Who tests

**CTO tests all items.** Mark each item **CEO** or **CTO** so the CEO can skip
technical-only work.

| Tag | Who ticks it | Use when the step is about |
|-----|----------------|----------------------------|
| **CEO** | CEO and CTO | Product direction, taste, or experience: how it feels, reads, or flows; what the assistant should do instead of interrogating; whether a UI is reviewable vs take-it-or-leave-it; copy, layout, empty states, chat personality. |
| **CTO** | CTO only | Correctness, plumbing, roles, persistence, ingest, migrations, auth, error paths, “does it still load.” |

Default to **CTO**. Promote to **CEO** only if a product person would care even
when the implementation is already “correct.” A migration, reload, forbidden
route, or “CI-equivalent” click is never CEO.

If nothing in the diff changes taste or experience, every item is **CTO**. Add
one line under the legend: `No CEO items — technical-only change.` Still
include the CEO fold (usually the “internal change only” line).

When refreshing, ignore the `CEO` / `CTO` prefix when matching checkmarks.

Cover only what this PR can break. Map paths to surfaces:

| Changed area | Tester should exercise |
|--------------|------------------------|
| Editor / sections / TipTap | Open both document types if the change is shared; otherwise the type you touched. Edit, auto-save, reload. |
| Eval / suggestions / Improve AI | Run AI Check or apply/dismiss a suggestion on a draft. |
| Chat / retrieval / ingest | Ask a question that needs an attachment or `read_section`; confirm citations or an honest miss. |
| Review / submit / approve / feedback | Engineer submit + manager approve or send feedback. |
| Auth / `proxy.ts` / roles | Sign in as the affected role; hit a forbidden path if auth changed. |
| Attachments / storage | Upload a small PDF/DOCX; confirm list + ingest status. |
| DOCX import/export | Export (and import if that changed); open the file. |
| Admin / audit / retention | Open the admin screen you changed. |
| Schema / migrations | Confirm preview boots; if a migration is required, note that on the first item. |

Always include a **negative or adjacent** check when the PR changes behavior
(wrong role, empty state, validation error, other `documentType`).

Backend-only or docs-only: still add **one** smoke item (preview loads, sign
in, open a report) plus any ops note the tester must know (env var, migration).

Release-candidate flows that are hard to automate (email, Word fidelity) live
in `docs/manual-test-cases.md` — link a specific `M-xx` row only when this PR
touches that area.

## Preserve checkmarks

When refreshing:

1. Normalize item text: lowercase, collapse whitespace, strip trailing
   punctuation, ignore a leading `CEO` / `CTO` tag and `as an <role>,`.
2. If a new item matches an existing `- [x]` under that normalization, keep
   it checked.
3. Drop items that no longer match the diff. Uncheck items whose meaning
   changed. New items start unchecked.
4. Do not re-check something just because CI passed.

## Guardrails

- Do not treat Playwright/Vitest coverage as a substitute for this list.
- Do not invent UI that is not in the diff.
- Do not put secrets, real passwords, or production URLs in items.
- Point testers at the **preview URL** when one exists; otherwise say local
  `pnpm dev`.
- If the user pastes extra tester notes, merge them into the same Test plan
  (do not create a second checklist).
