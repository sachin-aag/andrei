---
name: release-notes
description: >-
  Drafts user-facing and stakeholder release notes for this repo and writes a
  temporary GitHub-paste markdown file. Use when the user asks for release
  notes, a GitHub release description, changelog copy, ship notes, or “what
  shipped” summaries for M.J. Biopharm / investigation report / DMAIC /
  evaluation / DOCX export work.
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# Release notes (this project)

## Goal

Produce **paste-ready GitHub Release** (or PR) markdown: accurate to the repo, **stakeholder-friendly**, and split so **README stays minimal** while this skill carries the full procedure.

## Default output file

- Write or refresh **`GITHUB_RELEASE_NOTES_TEMP.md`** at the **repository root**.
- Start the file with a short **blockquote** reminding the user it is **temporary** and safe to delete after copying to GitHub.

If the user names a different path, follow their path but keep the same structure.

## Two modes

### 1. Baseline / major milestone (rare)

Use when there is **no prior release habit** or the product is first externalized.

- One **version title** (from `package.json` or user-supplied tag, e.g. `v0.1.0`).
- **Summary** (2–4 sentences): what problem, for whom, what replaces (DOCX/email → web).
- **Highlights** grouped as **Product** (user-visible) and **Technical** (stack, tests) only if useful to readers.
- **Roles / auth / config / known limitations** when they affect adoption or compliance narrative.

### 2. Incremental release (default)

Use for ongoing tags.

1. Read **`package.json`** `version` and confirm tag name with user if ambiguous.
2. Inspect **`git log`** from the **previous release tag** (or user-given base ref) to **HEAD** — summarize **behavioral** changes, not every commit.
3. Structure:
   - **Summary** — one tight paragraph.
   - **Added** / **Changed** / **Fixed** / **Removed** (omit empty sections).
   - **Migration / ops** — DB scripts (`db:ensure`, `db:fix-comments`, etc.), new env vars, breaking API routes.
   - **Known issues** — only if material.

## Product facts to ground accuracy (do not invent)

When writing for **this** codebase, re-read or grep as needed:

- **README.md** — workflow, features, data model summary.
- **`src/lib/ai/criteria.ts`** — criterion counts and intent.
- **`src/app/api/reports/...`** — evaluate, submit, approve, export behavior.
- **`templates/`** + **`src/lib/export/`** — DOCX is template-based (Docxtemplater), not ad-hoc `docx` only.

If something is uncertain, **verify in code** or label as **TBD** in an internal note — never fabricate regulatory or feature claims.

## Tone and audience

- **QA / managers / IT**: plain language, workflow-first, honest limitations.
- Avoid internal file paths unless under **Migration / ops**.
- No engagement filler; end with optional one-line “upgrade path” if migrations exist.

## README relationship

- **Do not** paste long release notes into **README.md**.
- At most, README may point to **GitHub Releases** or say “see `GITHUB_RELEASE_NOTES_TEMP.md` when drafting a release” — only if the user asked to update README.

## After delivery

- Tell the user: copy from **`GITHUB_RELEASE_NOTES_TEMP.md`**, publish the GitHub Release, then **delete** the temp file or add `GITHUB_RELEASE_NOTES_TEMP.md` to **`.gitignore`** if they regenerate often (only if they request ignore changes).
