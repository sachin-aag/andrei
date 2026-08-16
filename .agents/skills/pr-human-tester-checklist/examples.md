# Human tester checklist examples

Good items are a single, observable action a human can tick on the PR.
Prefix **CEO** (taste / experience; CTO tests these too) or **CTO** (CTO only).

## CEO plain-language fold

Always at the top of the PR body, collapsed. Everyday language; no code names.

Good (chat looks in attachments first):

```markdown
<details>
<summary>What's new (plain language)</summary>

For the CEO / anyone who will not read the diff.

- Chat used to interrogate the engineer for facts (batch numbers, dates, equipment IDs) even when those were already in the attached PDFs.
- It now looks in the attachments first. If the file has the answer, the reply should point at that file and page instead of asking you again.
- If the files don’t have the fact, it should say so (or ask once) — not invent a citation.
- This is about trust in the assistant, not a new screen.

</details>
```

Good (plumbing-only):

```markdown
<details>
<summary>What's new (plain language)</summary>

For the CEO / anyone who will not read the diff.

- Nothing in the product looks different. Internal change only.

</details>
```

Bad (jargon — this belongs in Summary, not the fold):

```markdown
- Adds `buildAutoEvidence`, English FTS, and `document_outline` to the Plan allowlist (`CHAT_PROMPT_VERSION` chat-v19).
```

## Good

Chat retrieval change:

```markdown
- [ ] **CEO** — As an engineer, attach a ready PDF and ask chat a question only that file answers — the reply should cite the document, not interrogate you for the fact.
- [ ] **CEO** — Ask a question the attachments cannot answer — it should search, then say it does not know instead of guessing.
- [ ] **CTO** — Reload, reopen Assistant — the previous turn is still there.
```

Shared editor change:

```markdown
- [ ] **CTO** — Open an investigation report, edit Define, wait for auto-save, reload — the text is still there.
- [ ] **CTO** — Open a design-verification report and confirm the same edit/save/reload path still works.
```

(No CEO items — save/reload is technical-only.)

Suggestion queue / copy / layout:

```markdown
- [ ] **CEO** — Ask Agent to draft Define — the gutter should show several **Draft step N of M** cards, not one giant take-it-or-leave-it card.
- [ ] **CTO** — Dismiss one remaining card — that block is skipped; other queued steps stay.
```

Auth change:

```markdown
- [ ] **CTO** — Sign in as an engineer and open `/admin` — you should be redirected or see forbidden, not the admin console.
- [ ] **CTO** — Sign in as an admin and confirm the user list still loads.
```

## Bad

```markdown
- [ ] Run the tests
- [ ] Make sure it works
- [ ] Check for regressions
- [ ] Review the code
- [ ] CI is green
```

These are not human product checks. CI already covers automated tests; “works”
is not an action.
