# Agent-mode workspace — execution plan

Status: **not started**. Plan only — do not treat this file as shipped product
behavior. Written for a junior engineer to implement in **three stacked PRs**.
Do not land all three in one PR.

If this file disagrees with the code, trust the code, then update this file.

---

## 1. What we are building

Today the report editor is **document mode**: attachments on the left, the
report canvas in the center, Assistant on the right. Chat **proposes** edits
(`ai_fix` / `ai_redraft` comments). The engineer accepts or dismisses them as
inline bubbles / review-margin cards.

We are adding **agent mode**:

| | Document mode (keep) | Agent mode (new) |
|---|---|---|
| Left | Attachments tree (`DocumentsPanel`) | Same attachments tree |
| Center | Report canvas | Chat |
| Right | Assistant (chat + criteria tabs) | Report canvas |
| Chat edits | Propose → accept / dismiss | Apply immediately (no bubbles) |
| After a turn that edited | “Proposed edit — review it in the document” | A **summary of what changed** |
| History | Per-section audit snapshots (not a product UI) | Each agent change-set is a **document version**; user can compare two |

In **both** modes, the **right** panel must be allowed to grow further than it
does today (chat in document mode, report canvas in agent mode).

Analytics (`Document | Analytics`) stays. Agent is a sibling surface, not a
replacement for Analytics and not a replacement for chat’s own Ask / Agent
toggle.

---

## 2. Read these first (in this order)

Do not start coding until you have opened these and can explain them out loud.

1. This file.
2. `src/components/report/report-workspace.tsx` — three-column shell, surface
   switch, where attachments / canvas / sidebar mount. Attachment preview is
   `AttachmentCanvas` inside `<main>` (not a fourth column).
3. `src/components/report/workspace-layout.ts` +
   `src/hooks/use-workspace-layout.ts` — panel width bounds. Chat max is
   **720px / 42% viewport**. Documents (attachments) max is **480px / 28%**.
   The center column is leftover space down to `mainMinWidth`.
4. `src/components/report/report-workspace-header.tsx` —
   `ReportWorkspaceSurface = "document" | "analytics"`. Document | Analytics
   tabs. `data-testid="report-surface-document"`.
5. `src/components/report/report-sidebar.tsx` +
   `src/components/report/chat-panel.tsx` — Assistant lives in the right
   sidebar. Chat composer Ask = `mode: "plan"`, Agent = `mode: "agent"`.
6. `src/lib/ai/chat/tools.ts` — `propose_edit` / `draft_field` /
   `edit_table` / `insert_image` / `remove_image` **insert comments**. They do
   **not** write `report_sections`. Apply happens later in
   `src/lib/suggestions/accept-suggestion.ts`.
7. `src/lib/suggestions/locator.ts` — `applyAndAcceptRichEdit` already
   locates + commits with **no leftover marks**. That is the commit primitive.
8. `src/app/api/reports/[reportId]/sections/[sectionType]/route.ts` +
   `src/lib/audit/record-section-version.ts` — every PATCH writes a
   **per-section** audit version. Human autosave (1.5s) also does this. Too
   noisy to be the product “Versions” list.
9. `.cursor/rules/document-types.mdc`, `chat-and-attachments.mdc`,
   `database.mdc`, `testing.mdc`.
10. `docs/agent-generated-charts-plan.md` — same “plan for the next engineer”
    shape.

---

## 3. Naming — do not collide these three “modes”

The codebase already uses “mode” for three different things. Mixing them up is
the most likely design bug.

| Name in code | Values | Meaning |
|---|---|---|
| `WorkspaceMode` (`report-provider`) | `edit` / `review` / `view` | Route: `/edit`, `/review`, admin view. **Do not extend.** |
| `ReportWorkspaceSurface` (header) | `document` / `analytics` | Canvas vs Analytics worksheet. **Add `agent` here.** |
| Chat composer `ChatMode` | `plan` (Ask) / `agent` (Agent) | Whether this turn may call edit tools. **Do not rename.** |

New name for “propose vs write”:

```ts
export type ChatEditPolicy = "propose" | "commit";
```

- Surface `document` + composer Agent → `propose` (today).
- Surface `agent` + composer Agent → `commit` (new).
- Composer Ask (`plan`) → no edit tools, either surface.

Never call the workspace surface `ChatMode`. Never call the header tab “Agent
mode” inside `src/lib/ai/chat/`. In UI copy:

- Header tabs: **Document**, **Agent**, **Analytics**.
- Composer: keep **Ask** / **Agent**.
- Left panel: keep the existing **Documents** attachments tree (do not rename
  the component in v1). In this plan “attachments” means that tree; “the
  document” means the report canvas.

---

## 4. Product rules (non-negotiable)

1. **All five `documentType`s.** Go through `getDocumentType()` /
   `getWorkspaceSections()` / `chatEditableSections()`. Do not hardcode DMAIC.
2. **Document mode behavior stays.** Propose, bubbles, review margin, accept /
   dismiss. If you break that, the PR is not done.
3. **Agent mode never leaves pending suggestion marks or open `ai_fix` /
   `ai_redraft` comments.** Generic documents (`suggestionApplyMode:
   "tracked_change"`) still **commit final** in agent mode. Tracked-change
   export marks are a Document-mode / Word-review concern.
4. **No accept widgets, no review-margin cards for agent-applied edits.**
5. **One document version per assistant turn that actually changed content**,
   not per tool call and not per keystroke. Human typing continues to
   autosave; those saves are **not** product versions.
6. **Inline compare** = one document with insertions / deletions in place
   (Word-compare / current suggestion colors). Not a GitHub side-by-side split.
7. **Lateral navigation.** Document ↔ Agent ↔ Analytics is tab-to-tab. Use a
   fade or no animation. Do **not** add `nav-forward` / `nav-back` slides
   (see view-transitions skill: directional slides are for hierarchical nav).
8. **Do not add `middleware.ts`.** Do not set `ALLOW_TEST_*` on Vercel. Do not
   use `pnpm db:push` in a non-TTY.

---

## 5. UX specification

### 5.1 Header switch

Today, when analytics is enabled, the header shows `Document | Analytics`.

Change it to always show **Document | Agent**, and keep **Analytics** as a
third tab when `isStatisticalAnalysisEnabled()`.

```
[ Document | Agent | Analytics ]
```

- `data-testid="report-surface-agent"`.
- Selected tab uses the existing selected styles (no new brand hex).
- Default surface on open: `document` (engineers land in the editor they know).
- Remember the last surface **in memory for this report only**, same as panel
  widths (`bindWorkspaceLayoutToReport`). Do not localStorage it in v1.
- Review / view routes (`workspaceMode !== "edit"`): Agent surface is allowed
  **read-only** (Ask chat + version compare). Composer Agent is disabled the
  same way it is today when `!canProposeAiEdits`.

`RunAllEvaluationButton` stays hidden unless surface is `document` (already
gated on `documentSurface`).

### 5.2 Layout (do not remount editors or chat)

Keep **one React tree** of: attachments column, canvas column (`<main>` with
section editors + `AttachmentCanvas`), chat column (`ReportSidebar`).

Swap who is center vs right with flex `order` + which column is `flex-1`:

| Surface | Column order | `flex-1` (leftover) | Fixed width |
|---|---|---|---|
| `document` | attachments, **canvas**, chat | canvas | attachments + chat |
| `agent` | attachments, **chat**, canvas | chat | attachments + canvas |
| `analytics` | keep today’s behavior | analytics canvas | attachments + chat |

Why not unmount/remount: section editors are all mounted on purpose (see the
comment at the top of `report-workspace.tsx`). Remounting ChatPanel would drop
composer text, in-flight turns, and session state.

In agent mode:

- Center `ReportSidebar` is full height of the leftover column. Default tab
  **Assistant**. Keep Placeholders / Criteria / Comments tabs so those
  features are not trapped in Document mode. They can stay a compact tab
  strip.
- Right canvas uses the **same** section editors. Narrower `max-w` is fine
  (`max-w-[1180px]` can stay; the column itself is what grows).
- Opening an attachment still uses `AttachmentCanvas` **inside `<main>`**. In
  agent mode that means the PDF replaces the right-hand document, **chat
  stays in the center**. Do not put the PDF in the chat column.
- Review margin (`MarginGutter`) stays off while chat is open (existing
  `isReviewGutterVisible`). Agent mode has chat open, so no gutter — correct,
  because there are no bubbles to park there.

Chat in the center should feel like a conversation, not a skinny rail: cap
the message list ~720–800px wide and center it in the column. Reuse
`ChatPanel`; do not fork a second chat implementation.

### 5.3 Wider right panel (both modes)

Today (`workspace-layout.ts`):

```
CHAT_ABS_MAX_PX = 720
CHAT_MAX_VIEWPORT_FRACTION = 0.42   // 1920px → 720 cap
MAIN_MIN_CAP_PX = 560               // leftover floor on wide screens
```

On a 1920px display the right chat cannot pass 720px. Raise that.

**Target (document mode, right = chat):**

| Constant | Today | Change to |
|---|---|---|
| `CHAT_MAX_VIEWPORT_FRACTION` | 0.42 | **0.55** |
| `CHAT_ABS_MAX_PX` | 720 | **960** |
| `CHAT_MAX_FLOOR_PX` | 420 | **560** (so small windows also get a higher max) |
| `MAIN_MIN_CAP_PX` | 560 | **420** (otherwise leftover floor fights the wider chat) |

Re-tune `workspace-layout.test.ts`. Current assertions that `desktop.max ===
720` must change. Keep the attachments-column bounds unless you have a reason
to touch them (user asked about the **right** panel).

**Agent mode, right = document canvas:** this column is a **new** sized panel,
not leftover. Add `previewWidthBounds()` (name it `canvas` or `preview`, not
`docs` — `docs` already means attachments):

| | Suggested start |
|---|---|
| Default | 480px |
| Abs min | 320px |
| Abs max | **960px** |
| Max viewport fraction | **0.55** |
| Min viewport fraction | 0.22 |

`allocateWorkspaceColumns` must take the active surface (or a `flexColumn:
"canvas" | "chat"` flag). Copy the existing overflow/`protect` logic; do not
rewrite it from scratch. Extend `useWorkspaceLayout` with `setPreviewWidth` /
`resetPreviewWidth` and a third resize handle on the canvas column in agent
mode (`label="Resize document panel"`).

Double-click still resets to the default (existing handle behavior).

### 5.4 Direct apply + summary

When surface is `agent` and composer is Agent:

1. Flush pending section autosaves **before** the POST
   (`flushPendingSectionSaves`). Pause autosave for the whole turn (mirror
   `suggestionApplyTransition` / `analyticsAgentBusy` — add
   `agentCommitInFlight` on the report provider).
2. Edit tools **write `report_sections` immediately** and return
   `status: "applied"` (not `"proposed"`).
3. Do **not** insert `comments` rows for those edits.
4. After each successful apply, the client refreshes that section (or the
   whole bundle). The right-hand document updates live; no accept click.
5. When the turn finishes, if ≥1 apply succeeded, show a **Changes this turn**
   block in the transcript (not only a toast):

   ```
   Changes this turn
   • Define · narrative — added the detection date from the batch record
   • Measure · narrative — inserted assay results table
   ```

   Build this from tool results + `reasoning` arguments (deterministic). Do
   not rely on the model to remember to summarize. If every apply failed, do
   not show an empty summary; the existing per-tool error lines are enough.

6. Create **one** document revision for that turn (milestone 3). Link it from
   the summary (“Saved as version 4”).

Tool chrome in `chat-panel.tsx` (`"Proposed edit to Define — review it in the
document."`) must branch on status: `"applied"` → `"Applied to Define"`.

### 5.5 Versions + compare

A **History** control on the right canvas header (agent mode; also fine in
document mode once the table exists):

- List: version number, relative time, one-line summary, “Agent” source.
- Empty: “Versions appear after the assistant edits the document.”
- **Compare**: two version pickers (From / To). Default: previous vs latest.
- Compare view replaces the live editors in the canvas with a **read-only
  inline diff**. Banner: `Comparing version 3 → version 5` + **Exit compare**.
- Inserted text: existing suggestion-insert green. Deleted text: existing
  suggestion-delete strikethrough. **No** accept / dismiss widgets.
- v1 does **not** include Restore / revert. Say no if asked; file a follow-up.

Human edits between agent turns do not create versions. If the document changed
only by typing, History stays unchanged. That is intentional.

---

## 6. Architecture

```
Composer Agent + surface=agent
        │
        ▼
POST /api/reports/:id/chat  { mode: "agent", editPolicy: "commit", ... }
        │
        ├─ Ask tools unchanged (search, read_section, …)
        ├─ Edit tools → commitChatEdit()  ──► UPDATE report_sections
        │                      │              recordSectionVersion (audit, existing)
        │                      └──────────► TurnEditLog[]
        │
        ▼ turn end (after())
   If TurnEditLog nonempty:
        insert document_revisions + per-section snapshots
        persist a changes-summary part on the assistant message
        │
        ▼ client
   refresh sections → right canvas updates
   render Changes this turn
```

```
Compare vA vs vB
        │
GET /api/reports/:id/revisions/:a/diff/:b
        │
        ├─ load snapshots (full JSON per section)
        ├─ per field: word-level diff → ins/del HTML or TipTap marks
        └─ DocumentRevisionDiff (read-only)
```

### 6.1 Do not use `sectionContentVersions` as the product history

`section_content_versions` is the Part 11 / audit chain (JSON-Patch, every
autosave). Keep writing it. Do **not** show it in the History UI.

New tables (names can vary; keep them report-scoped and cascaded):

```ts
documentRevisions: {
  id
  reportId
  revisionNo          // monotonic per report, starting at 1
  source              // 'agent_turn' (v1 only)
  chatSessionId       // nullable
  chatMessageId       // assistant message that closed the turn
  summary             // deterministic bullet text, also shown in chat
  createdBy           // workspace user id
  createdAt
}

documentRevisionSections: {
  id
  revisionId
  section             // SectionType
  content             // jsonb full snapshot
  contentHash
}
```

Snapshot **every workspace section** at turn end (not only changed ones) so
compare does not have to reconstruct from audit patches. Reports are small.
Use `hashSectionContent` from `src/lib/audit/content-hash.ts`.

Skip creating a revision when the turn applied nothing.

`pnpm db:generate` after schema edits; commit the SQL. Next migration number
after `0048_last_login_at.sql` is **0049_…**. Runtime driver stays `pg`.

### 6.2 Commit path (milestone 2) — extract, don’t duplicate

Today the PATCH route inlines the write. Chat tools only insert comments.
`acceptSuggestion` is **client-side** (fetch PATCH).

Add a **server** helper used by chat commit (and optionally by the PATCH
route):

```
src/lib/reports/persist-section.ts
  persistSectionContent({ reportId, section, newContent, actor })
    - load row
    - recordSectionVersion(...)
    - update report_sections

src/lib/ai/chat/commit-edit.ts
  commitLocatedEdit / commitRedraft / commitTableOperation / commitImage…
    - BEGIN
    - SELECT report_sections WHERE report_id AND section FOR UPDATE
    - mergeSection
    - applyAndAcceptRichEdit | applyRedraftToSection | applyTableOperation | …
    - persistSectionContent
    - COMMIT
    - return { status: "applied", section, targetField, summary }
```

**Serialize writes per section.** Gemini can call two tools in parallel on the
same section. Without `FOR UPDATE`, the second read wins and drops the first
edit. Ingest already uses `select … for update` (`src/lib/attachments/`). Copy
that pattern. `db.transaction()` is required (Neon HTTP cannot; we use `pg`).

Locator failures stay the same statuses (`not_found`, `ambiguous`, …) so the
model can retry. Only the success status changes (`proposed` → `applied`).

`canEdit` still uses `canSaveReportSection`. Read-only reports cannot commit.

### 6.3 Prompt / tools

Pass `editPolicy` into `buildChatTools` and `buildChatSystemPrompt`.

When `commit`:

- Tool descriptions: “applied immediately to the document” / “do not wait for
  the engineer to accept.”
- System prompt Agent block: same locate rules (`read_section` first, unique
  anchors, `edit_table` for tables). Delete “the engineer reviews and accepts
  or rejects.”
- Return JSON `status: "applied"`.

When `propose`: **byte-for-byte today’s behavior.**

Bump `CHAT_PROMPT_VERSION` in `src/lib/ai/chat/system-prompt.ts` when the
Agent-surface copy changes.

Plan-mode allowlist (`pickPlanModeChatTools` / chat route) **does not** gain
edit tools. Ask still cannot edit.

Stub chat (`src/lib/ai/chat/stub-model.ts`): today it calls `propose_edit`.
When `editPolicy === "commit"`, the stub should still emit the same tool name
(so the UI path is real) but the tool execute will persist. E2E **cannot**
assert tool choice (`TESTING.md`). Cover commit with Vitest.

### 6.4 Autosave vs commit (race)

This will ship a silent overwrite if you skip it.

1. Chat send in agent surface: `await flushPendingSectionSaves()` first.
2. Set `agentCommitInFlight` so `useSectionSave` disables autosave (same
   gate as `suggestionApplyTransition`).
3. After each `applied` tool result (and on turn end), `refresh()` so TipTap
   reloads server JSON.
4. Clear `agentCommitInFlight` on finish / error / cancel.

Do **not** add section PATCH versioning in v1 unless refresh still loses
edits. If you see last-write-wins in testing, stop and add a `version`
column on `report_sections` (analytics worksheets already do this). Do not
guess — reproduce first.

### 6.5 Inline diff (milestone 3)

Do **not** use `buildRedraftPreviewDoc` (it concatenates old+new wholesale).
Do **not** try to round-trip a word-diff back into live editable TipTap.

New module: `src/lib/document-revisions/inline-diff.ts`

- For each section in `getWorkspaceSections(documentType)`, for each field
  from `chatTargetFields(section)` (and cover-page metadata if that type has
  it):
  - If JSON equal (`hashSectionContent`): render current read-only content.
  - Plain string: `diffWords` (add the `diff` package) → wrap in `<ins>` /
    `<del>`.
  - Rich TipTap: flatten to the same canonical text you already use for
    anchors (`flattenForAnchor` / markdown from existing prompt context),
    word-diff, render as HTML with `prose` styles. Tables: if both sides are
    tables, diff **cell text** and highlight changed cells; do not pipe-diff
    markdown tables.
- CSS: reuse suggestion insert/delete tokens from `globals.css`, not new
  brand colors. `prefers-reduced-motion` already exists for view transitions.

Read-only component: `src/components/report/document-revision-diff.tsx`.
Fed by the diff API. Section headings from the registry labels.

API:

```
GET    /api/reports/[reportId]/revisions
GET    /api/reports/[reportId]/revisions/diff?from=<id>&to=<id>
```

Auth: `loadAccessibleReport` (same as chat). Do not leak other users’ reports.

---

## 7. How to ship (three PRs)

Each PR must include the CEO fold, detailed Summary, and Test plan from
`.agents/skills/pr-human-tester-checklist`. Update those when you push more
commits.

### Milestone 1 — Layout only (no apply change)

**Goal:** Engineer can switch Document ↔ Agent. Agent shows attachments |
chat | document. Right panel resizes further in both modes. Chat still
**proposes**.

Files (expected):

- `src/components/report/report-workspace-header.tsx` — third tab; fix
  `aria-selected={!documentSurface}` which today treats Agent as Analytics.
  Analytics must be `surface === "analytics"`, not “anything not document.”
- `src/components/report/report-workspace.tsx` — surface `'agent'`, flex
  order, `AttachmentCanvas` stays in `<main>`.
- `src/components/report/workspace-layout.ts` + hook +
  `workspace-resize-handle.tsx` — wider chat max; preview bounds; allocate
  leftover to chat when surface is agent.
- `src/components/report/workspace-layout.test.ts` — new numbers + agent
  allocation cases (both panels open, one collapsed, window shrink, protect
  on drag).
- `e2e/report-editor.spec.ts` — add agent surface resize; keep existing
  document-mode resize.
- `e2e/helpers/workspace.ts` — helper to click Agent.
- `CLAUDE.md` / `AGENTS.md` — one sentence that Document | Agent | Analytics
  exist; Agent is a layout, chat Ask/Agent is unchanged.

**Do not** change tools, prompts, or schema.

Manual check: switch back to Document — editors still have unsaved typing,
chat transcript still there, Analytics still works.

### Milestone 2 — Commit policy + change summary

**Goal:** In Agent surface, composer Agent writes the document. No bubbles.
Summary after the turn. Document mode still proposes.

Files (expected):

- `src/lib/reports/persist-section.ts` (new) — extract from PATCH route.
- `src/lib/ai/chat/commit-edit.ts` (new) + `commit-edit.test.ts`.
- `src/lib/ai/chat/tools.ts` — branch on `editPolicy`.
- `src/lib/ai/chat/system-prompt.ts` — commit copy; bump
  `CHAT_PROMPT_VERSION`; update `system-prompt.test.ts` frozen string.
- `src/app/api/reports/[reportId]/chat/route.ts` — read `editPolicy` from
  body (only honor `commit` when `canSaveReportSection` and surface is
  intended; **do not trust the client blindly** — if they send `commit` on a
  locked report, refuse). Prefer deriving from an explicit body field
  `workspaceSurface: "document" | "agent"` and ignoring `editPolicy` from
  the client if you want one source of truth.
- `src/components/report/chat-panel.tsx` — pass surface; flush+busy flag;
  tool line copy; **Changes this turn** UI from tool parts.
- `src/hooks/use-section-save.ts` — pause on `agentCommitInFlight`.
- `src/providers/report-provider.tsx` — the flag + refresh after applies.
- Vitest: tools.test.ts commit vs propose; persist-section locking
  (two sequential commits on one section both land).
- E2E: still cannot assert tool selection with stub chat. Assert the Agent
  surface still streams (`e2e/report-chat.spec.ts`) and that Document mode
  still shows a proposal path if the stub emits `propose_edit`.

**Do not** add History UI yet. You may insert revisions in `after()` if the
schema from milestone 3 already merged; otherwise wait. Prefer **schema in
milestone 3** so this PR stays reviewable. Summary can live only in the
transcript until then.

### Milestone 3 — Document versions + compare

**Goal:** Each committing turn creates a version. User compares two with an
inline diff.

Files (expected):

- `src/db/schema/index.ts` + `pnpm db:generate` →
  `src/db/migrations/0049_document_revisions.sql`.
- `src/lib/document-revisions/` — `record-revision.ts`, `list-revisions.ts`,
  `inline-diff.ts` + tests (equal fields, word insert, word delete, table
  cell change, unknown section skipped).
- API routes under `src/app/api/reports/[reportId]/revisions/`.
- `src/components/report/document-revision-history.tsx` (list + pickers).
- `src/components/report/document-revision-diff.tsx`.
- Wire History into the canvas column (agent mode required; document mode
  optional but nice).
- Chat summary “Saved as version N” once the row exists.
- `docs/database-schema.md` if that file lists tables.
- E2E (chromium): after a stubbed apply (if you can seed a revision via a
  test-only insert helper, do that — do not depend on Gemini). Open History,
  compare v1 vs v2, see ins/del, Exit compare returns to live editors.

Seed helper: `POST /api/test/...` is the wrong place unless you already have
a pattern. Prefer inserting revisions in a Vitest that hits the lib, and an
E2E that calls the real API after using a small test fixture route **only if**
`ALLOW_TEST_LOGIN` is on. Otherwise: unit-test the diff, E2E-test the empty
History + picker chrome with a fixture report that you pre-insert via a
script in the spec using the same DB the webServer uses (Playwright already
has `DATABASE_URL`). Keep it simple: a lib function `createDocumentRevisionForTests`
used by the e2e spec through an existing test login + API is enough if you
add `POST /api/reports/:id/revisions` as an internal checkpoint. **v1 does
not need a user-facing “Save version” button.**

---

## 8. Implementation notes for each area

### Header `aria-selected` bug

```tsx
aria-selected={!documentSurface}  // WRONG once Agent exists
```

Analytics is selected only when `surface === "analytics"`. Agent is selected
when `surface === "agent"`. Copy the Document tab’s className pattern; do not
invent a third visual style.

Show Document | Agent even when Analytics is packed off. Today the whole
tablist is hidden unless `showAnalyticsToggle`. That would hide Agent on a
hypothetical pack with stats off. Always render Document | Agent.

### Flex order (sketch)

```tsx
<div ref={containerRef} className="relative flex min-h-0 flex-1">
  <div className="order-1 shrink-0" style={{ width: docsWidth }}>…attachments…</div>

  <main
    className={cn(
      agentSurface ? "order-3 shrink-0" : "order-2 min-w-0 flex-1"
    )}
    style={agentSurface ? { width: previewWidth } : undefined}
  >
    …editors / AttachmentCanvas / analytics…
  </main>

  <div
    className={cn(
      agentSurface ? "order-2 min-w-0 flex-1" : "order-3 shrink-0"
    )}
    style={agentSurface ? undefined : { width: chatWidth }}
  >
    <ReportSidebar … />
  </div>
</div>
```

Resize handles: chat handle `edge="start"` in document mode (handle on the
left of the right column). In agent mode the chat column is center — put the
canvas handle on the left edge of the right column (`edge="start"`),
attachments handle unchanged.

### Commit helper (sketch)

```ts
export type CommitEditResult =
  | { status: "applied"; section: SectionType; targetField: string; summary: string }
  | { status: "not_found" | "ambiguous" | "cross_cell" | "too_large" | …; hint: string }
  | { status: "not_editable"; message: string };

export async function commitLocatedEdit(args: {
  reportId: string;
  actor: AuditActorSnapshot;
  documentType: DocumentType;
  section: SectionType;
  targetField: string;
  edit: ProposedEditInput;
  reasoning: string;
}): Promise<CommitEditResult>
```

Inside the transaction, **re-run** `checkProposedEdit` on the locked row.
Stale anchors after a prior tool in the same turn should return `not_found`
so the model re-reads. That is a feature.

Reuse `applyAndAcceptRichEdit` (rich), `applyEditToPlainText` (plain),
`applyRedraftToSection` (draft_field), `applyTableOperation` (tables),
existing image insert/remove apply functions. Do not copy-paste locate logic.

### Changes-this-turn UI

Parse the assistant message `parts` for tool results with
`status === "applied"`. One card at the **end** of that assistant message
(not a second fake assistant message). Persist it: either a custom part you
append when saving the turn (`partsForPersistedAssistantTurn`) or a
`metadata.changeSummary` on `chat_messages`. Prefer **metadata** so the model
never sees a fake user/assistant message on the next turn.

```ts
metadata: {
  …existing chatAssistantTurnMetadata,
  changeSummary?: { revisionNo?: number; items: { section, targetField, reasoning }[] }
}
```

### Compare empty / identical

If From === To, show “Pick two different versions.” If hashes match on every
section, show the document with a banner “No differences.” Do not render a
blank page.

Cover page / `reports.metadata` (DV): include it in the snapshot JSON (store
a synthetic `__report_metadata` key or a column). If that is too much for v1,
document it as a known gap and still snapshot `report_sections` only — but
then say so in the PR. Prefer snapshotting metadata in the revision row
(`metadata jsonb`) so DV cover fields compare.

---

## 9. Tests (minimum)

### Vitest (every milestone)

| Area | File | Cases |
|---|---|---|
| Bounds | `workspace-layout.test.ts` | 1280 / 1920 / 1024 chat max after the raise; agent leftover goes to chat; preview clamp; overflow still shrinks the non-protected panel |
| Header | new `report-workspace-header.test.tsx` if none | Agent tab selected; Analytics not selected; stats off still shows Document \| Agent |
| Commit | `commit-edit.test.ts` | happy path rich + plain; `not_found`; two sequential edits on one section both persist; `canEdit false`; generic_document still final (no pending marks) |
| Tools | `tools.test.ts` | propose path unchanged when `editPolicy: "propose"`; commit path does not insert comments |
| Prompt | `system-prompt.test.ts` | version bump; commit copy present only for that policy |
| Diff | `inline-diff.test.ts` | insert word, delete word, equal, table cell, skips identical sections |
| Schema | existing drizzle patterns | revisionNo monotonic; cascade delete with report |

Mock `@/db` when the module loads `DATABASE_URL` (testing rule).

### Playwright

- Milestone 1: `e2e/report-editor.spec.ts` — open report, click Agent, chat is
  in the middle (e.g. `getByRole('complementary', { name: 'Report sidebar' })`
  is between attachments and canvas — assert bounding boxes:
  `docs.x < chat.x < canvas.x`). Click Document, order reverses. Keyboard
  resize right panel past the **old** 720px cap on a 1600px viewport.
  Analytics tab still opens the worksheet.
- Milestone 2: `e2e/report-chat.spec.ts` — Agent surface still streams with
  stub chat. Document mode still has accept UI if a proposal exists
  (`e2e/suggestion-accept.spec.ts` must stay green).
- Milestone 3: new `e2e/document-revisions.spec.ts` — seed two revisions,
  compare, ins/del visible, Exit.

Always `--project=chromium` while iterating. `afterEach` `deleteReport`.

### What you cannot test with stub chat

Stub chat cannot prove the model picked `propose_edit`. Do not write an E2E
that waits for “Applied to Define” unless you seed the tool result or run
with real keys (don’t in CI). Unit-test the commit function instead.

---

## 10. Pitfalls (read twice)

1. **Unmounting ChatPanel or section editors on surface switch.** You will
   lose focus, in-flight turns, and typed-but-unsaved text. Reorder columns.
2. **Treating `sectionContentVersions` as History.** Autosave will create
   dozens of “versions” per minute.
3. **Parallel tool applies without `FOR UPDATE`.** Silent dropped edits.
4. **Autosave overwriting a commit** with stale TipTap JSON. Flush + pause +
   refresh.
5. **Leaving `ai_fix` comments in commit mode.** Bubbles will reappear in
   Document mode when the engineer switches back.
6. **`aria-selected={!documentSurface}`** marking Agent as Analytics.
7. **Plan-mode allowlist.** Do not add commit tools to Ask.
8. **Hardcoding `define` / DMAIC.** QRA, DV, mechanical DV, generic body must
   work. Generic body is one `body` field — commit still uses
   `applyAndAcceptRichEdit` / redraft, **not** tracked_change.
9. **Turbopack 404** on new API routes in `pnpm dev`. Restart (and optionally
   `rm -rf .next`). Not a logic bug.
10. **View transitions.** Bare `<ViewTransition>` without `default="none"`
    will fade the whole shell on every tab click. Isolate the header with
    `viewTransitionName` if needed; do not wrap `{children}` in the layout.
11. **Trusting `editPolicy` from the client** on a submitted/locked report.
12. **New chat sessions for Agent.** Reuse `chatSessions.surface = "report"`.
    Analytics chat stays `surface = "analytics"`. Do not add a third session
    surface unless you have a product reason (you don’t).

---

## 11. Out of scope (v1)

- Restore / revert a version.
- Product versions for human typing or manager track-changes.
- Collaborative live cursors (`docs/collaborative-editing-plan.md`).
- Changing Improve AI, eval traffic lights, or Word export.
- Asking the model to “be more autonomous” beyond apply-vs-propose.
- Mobile layout (the workspace is desktop-first; existing collapse rails are
  enough).
- Persisting Document | Agent choice across reloads / users.
- Side-by-side (two panes) compare.

---

## 12. Docs to update when the feature ships

Not in the plan PR — in the milestone that lands the UI:

- `CLAUDE.md` — workspace surfaces; agent commit vs document propose;
  `documentRevisions` vs `sectionContentVersions`.
- `AGENTS.md` — one line under the report workspace / chat summary.
- `.cursor/rules/chat-and-attachments.mdc` — `editPolicy` / commit helper.
- `.cursor/rules/database.mdc` — new tables.
- `TESTING.md` — new e2e spec.
- `docs/database-schema.md` if it enumerates tables.

---

## 13. Suggested first day

1. Run the app, open a draft report, drag the right chat handle, note that it
   stops around 720px on a large window. That is the bug milestone 1 fixes.
2. Send a chat Agent message that drafts a sentence. Accept the bubble. That
   is what milestone 2 removes **only** in Agent surface.
3. Sketch the three-column swap on paper with `order` / `flex-1` before
   touching tools.
4. Land milestone 1. Get it on a preview. Then start commit.

If milestone 1 is not merged, do not start schema work.

---

## 14. Definition of done (all three milestones)

- Engineer can switch Document ↔ Agent without losing chat or editor state.
- Agent layout is attachments | chat | document.
- Right panel in both modes can be dragged past today’s 720px chat cap on a
  1440–1920px window, and the other columns still usable.
- In Agent surface, Assistant Agent edits appear in the document with no
  accept click and no bubbles; switching back to Document does not suddenly
  show those edits as pending suggestions.
- In Document surface, propose + accept still works (regression).
- After a successful Agent turn, the transcript shows a change summary.
- History lists one row per successful Agent turn; compare shows inline
  ins/del; Exit returns to the live document.
- Ask mode never writes. Locked / view reports never commit.
- `pnpm precommit` green. Chromium e2e for layout + history chrome green.
- PR bodies have CEO fold + Summary + Test plan.

### CEO-facing test (write this into milestone PRs)

- **CEO** — Toggle Document vs Agent. Chat should feel like the main thing in
  Agent, with the report still visible on the right. Drag the right edge
  further than before.
- **CEO** — In Agent, ask the assistant to add a sentence. It should appear in
  the document without Accept. The chat should list what it changed, in
  English.
- **CEO** — Open History, compare the last two versions, confirm you can see
  what was added/removed in place, then leave compare.
- **CEO** — Switch to Document and confirm you still review suggestions the
  old way (bubbles / Accept) for new chat edits made there.
