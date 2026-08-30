# Agent-mode workspace — execution plan

Status: **implemented** on `cursor/agent-mode-workspace-plan-aba8`. Trust the
code if this file disagrees, then update this file.

Originally written as three stacked PRs. The product decision was to land
layout, commit-on-edit, and document versions together.

If this file disagrees with the code, trust the code, then update this file.

---

## 1. What we are building

Two ways of working. Not three.

Today the header treats **Document** and **Analytics** as peer modes of the
whole workspace. That is the wrong split. Analytics is part of the *work
product* (the report and its worksheet). It is not a third way of using the
app.

The split that matters is **Document vs Agent**:

| | Document chrome | Agent chrome |
|---|---|---|
| Left | Attachments tree | Attachments tree |
| Center | **Work product** (report *or* analytics) | **Chat** |
| Right | Chat | **Work product** (report *or* analytics) |
| Chat edits to the report | Propose → accept / dismiss | Apply immediately (no bubbles) |
| After a report-editing turn | “Review it in the document” | A **summary of what changed** |
| History | Audit snapshots only (not a product UI) | Each agent change-set is a **document version**; compare two |

The **work product column** is one column. It has an inner switch:

```
[ Report | Analytics ]
```

That switch already exists today — it just lives in the header and hijacks the
whole layout. **Move it into the work product column.** In document chrome the
column is the center. In agent chrome the column is the **right**. So in agent
mode, analytics is on the right *as well as* the report. You never leave Agent
to “go to Analytics.”

In **both** chromes, the **right** panel must grow further than it does today
(chat today, work product in agent chrome).

Chat’s own Ask / Agent toggle is unchanged. Analytics chat already writes the
worksheet directly in Agent; report chat in agent chrome should start doing
the same to the report.

---

## 2. Picture

```
DOCUMENT CHROME                         AGENT CHROME
┌────────┬──────────────┬─────────┐     ┌────────┬──────────────┬──────────────┐
│ Attach │ Work product │  Chat   │     │ Attach │     Chat     │ Work product │
│        │ Report│Analyt│         │     │        │              │ Report│Analyt│
└────────┴──────────────┴─────────┘     └────────┴──────────────┴──────────────┘
```

Header (always):

```
[ Document | Agent ]
```

Not `[ Document | Agent | Analytics ]`. Not today’s `[ Document | Analytics ]`
as the top-level switch.

Work product column header (when stats are enabled):

```
[ Report | Analytics ]
```

Keep the existing test ids on those inner tabs
(`report-surface-document`, `report-surface-analytics`) so current e2e keeps
working. New test ids on the chrome switch:
`report-chrome-document`, `report-chrome-agent`.

Opening a PDF still replaces the **work product** column (`AttachmentCanvas`
inside that column), never the chat column. In agent chrome that means the
file opens on the right; chat stays center.

---

## 3. Read these first (in this order)

Do not start coding until you can explain them out loud.

1. This file.
2. `src/components/report/report-workspace.tsx` — three-column shell. Header
   `surface` is `"document" | "analytics"` today and swaps `<main>` between
   editors and `StatisticalWorkspace`. Attachment preview is
   `AttachmentCanvas` inside `<main>`.
3. `src/components/report/report-workspace-header.tsx` — the Document |
   Analytics tablist. `aria-selected={!documentSurface}` is already wrong
   once a third concept exists; we are removing Analytics from this header
   entirely.
4. `src/components/report/report-sidebar.tsx` — when `surface === "analytics"`
   it hides document tabs and shows `AnalyticsChatPanel` instead of
   `ChatPanel`. That swap must follow the **work product view**, not chrome.
5. `src/components/report/workspace-layout.ts` +
   `src/hooks/use-workspace-layout.ts` — chat max **720px / 42% viewport**.
   Attachments max **480px / 28%**. Center is leftover down to
   `mainMinWidth`.
6. `src/components/report/chat-panel.tsx` — composer Ask = `mode: "plan"`,
   Agent = `mode: "agent"`.
7. `src/lib/ai/chat/tools.ts` — report edit tools **insert comments**. They
   do not write `report_sections`. Apply is
   `src/lib/suggestions/accept-suggestion.ts`.
8. `src/lib/suggestions/locator.ts` — `applyAndAcceptRichEdit` locates +
   commits with **no leftover marks**. That is the report-commit primitive.
9. Analytics chat (`src/lib/statistical-analysis/chat-tools.ts`) already
   mutates the worksheet in Agent. Do not make report-agent *more*
   conservative than analytics-agent.
10. `src/lib/audit/record-section-version.ts` — every section PATCH writes a
    per-section audit version, including human autosave. Too noisy for
    History.
11. `.cursor/rules/document-types.mdc`, `chat-and-attachments.mdc`,
    `database.mdc`, `testing.mdc`.
12. `e2e/helpers/workspace.ts` — `report-surface-analytics` click helper.

---

## 4. Naming — four different words, do not collide them

| Name in code | Values | Meaning |
|---|---|---|
| `WorkspaceMode` (`report-provider`) | `edit` / `review` / `view` | Route. **Do not extend.** |
| `WorkspaceChrome` (new) | `document` / `agent` | Header: editor-centric vs chat-centric layout. |
| `WorkProductView` (new) | `report` / `analytics` | Inner tab of the work product column. Today this is misnamed `ReportWorkspaceSurface`. |
| Chat composer `ChatMode` | `plan` (Ask) / `agent` (Agent) | Whether this turn may call edit tools. **Do not rename.** |

Delete `ReportWorkspaceSurface` as the header type. Replace call sites:

```ts
export type WorkspaceChrome = "document" | "agent";
export type WorkProductView = "report" | "analytics";
```

`ChatEditPolicy` for report chat only:

```ts
export type ChatEditPolicy = "propose" | "commit";
```

- Chrome `document` + composer Agent + work product `report` → `propose`.
- Chrome `agent` + composer Agent + work product `report` → `commit`.
- Composer Ask → no report edit tools.
- Work product `analytics` → existing analytics chat (Ask searches/extracts;
  Agent already writes the worksheet). Unchanged policy.

UI copy:

- Header: **Document**, **Agent**.
- Work product: **Report**, **Analytics** (keep “Document” out of this pair
  so it does not clash with the header). If “Report” feels wrong for
  `generic_document`, use the type’s `documentNoun` — but default the tab
  label to **Report** so the header owns the word Document.
- Composer: keep **Ask** / **Agent**.
- Left panel: keep the attachments tree labeled **Documents** in v1.

---

## 5. Product rules (non-negotiable)

1. **Analytics is not a workspace chrome.** No third header tab. Switching
   Report ↔ Analytics must not change column order, must not unmount chat,
   and must not kick you out of Agent.
2. **All five `documentType`s.** `getDocumentType()` /
   `getWorkspaceSections()` / `chatEditableSections()`. No hardcoded DMAIC.
   Analytics inner tab only renders when `isStatisticalAnalysisEnabled()`.
3. **Document chrome keeps today’s report-chat behavior.** Propose, bubbles,
   review margin, accept / dismiss.
4. **Agent chrome + report view never leaves pending suggestion marks or
   open `ai_fix` / `ai_redraft` comments.** Generic documents still **commit
   final**. Tracked-change Word marks are a document-chrome concern.
5. **No accept widgets for agent-applied report edits.**
6. **One document version per assistant turn that changed report content**,
   not per tool, not per keystroke, not per analytics write. Worksheet
   changes are not document versions.
7. **Inline compare** = one report with insertions / deletions in place.
   Not side-by-side. Compare is a state of the **Report** view; if you are
   on Analytics, switching to compare switches the inner tab to Report.
8. **Lateral chrome.** Document ↔ Agent is a tab. Fade or none. No
   `nav-forward` slides.
9. **Do not add `middleware.ts`.** Do not set `ALLOW_TEST_*` on Vercel. Do
   not `pnpm db:push` without a TTY.

---

## 6. UX specification

### 6.1 Header = chrome only

Always:

```
[ Document | Agent ]
```

- `data-testid="report-chrome-document"` / `report-chrome-agent"`.
- Default chrome on open: `document`.
- Remember chrome **in memory for this report only** (same as panel widths).
- Review / view routes: Agent chrome is allowed read-only (Ask + History
  compare). Composer Agent stays disabled when `!canProposeAiEdits`.
- `RunAllEvaluationButton` only when chrome is document **and** work product
  is report (today: `documentSurface`).

**Move** the current Document | Analytics control out of this header and into
the work product column. Update every `onSurfaceChange` in
`report-workspace.tsx` (today it also forces `sidebarTab` to assistant and
sets `analyticsOpen`).

### 6.2 Work product column = Report | Analytics

One column, two views. Implement as inner tabs at the top of `<main>` (the
canvas), visible in **both** chromes when stats are on.

- Report view: today’s section editors + review gutter rules + editor
  toolbar.
- Analytics view: today’s `StatisticalWorkspace`. Keep
  `analyticsOpen` / `reloadEpoch` / `agentBusy` wiring.
- Keep `ChatPanel` vs `AnalyticsChatPanel` swap in `ReportSidebar`, keyed off
  `workProductView === "analytics"`, **not** off chrome.
- Do not remount `StatisticalWorkspace` or the section editors when toggling
  chrome. Hide with CSS / `hidden`+`inert` like today’s attachment preview.
  Same for the two chat panels if they already mount that way.

When stats are off, the column is just the report. No inner tabs.

### 6.3 Layout — reorder columns, do not remount

Keep one React tree: attachments | work product (`<main>`) | chat
(`ReportSidebar`).

| Chrome | Column order | `flex-1` leftover | Fixed width |
|---|---|---|---|
| `document` | attachments, **work product**, chat | work product | attachments + chat |
| `agent` | attachments, **chat**, work product | chat | attachments + work product |

```tsx
<main
  className={agentChrome ? "order-3 shrink-0" : "order-2 min-w-0 flex-1"}
  style={agentChrome ? { width: previewWidth } : undefined}
>
  {/* inner Report | Analytics tabs */}
  {/* report editors (hidden if analytics or viewing attachment) */}
  {/* StatisticalWorkspace (hidden if report or viewing attachment) */}
  {/* AttachmentCanvas when a file is open */}
</main>
```

Why not unmount: section editors are all mounted on purpose (comment at the
top of `report-workspace.tsx`). Remounting chat drops composer text and
in-flight turns.

In agent chrome the center chat should feel like a conversation: cap the
transcript ~720–800px and center it in the column. Reuse `ChatPanel` /
`AnalyticsChatPanel`; do not fork.

Review margin is opt-in via the Comments switch (`isReviewGutterVisible`).
Agent chrome hides the gutter and clears the toggle on entry — correct, there
are no bubbles in that chrome.

### 6.4 Wider right panel (both chromes)

Today (`workspace-layout.ts`):

```
CHAT_ABS_MAX_PX = 720
CHAT_MAX_VIEWPORT_FRACTION = 0.42
MAIN_MIN_CAP_PX = 560
```

**Document chrome, right = chat:**

| Constant | Today | Change to |
|---|---|---|
| `CHAT_MAX_VIEWPORT_FRACTION` | 0.42 | **0.55** |
| `CHAT_ABS_MAX_PX` | 720 | **960** |
| `CHAT_MAX_FLOOR_PX` | 420 | **560** |
| `MAIN_MIN_CAP_PX` | 560 | **420** |

**Agent chrome, right = work product** (report *or* analytics): new sized
panel, not leftover. Add `previewWidthBounds()` (do not reuse `docs` — that
is attachments):

| | Start here |
|---|---|
| Default | 480px |
| Abs min | 320px |
| Abs max | **960px** |
| Max viewport fraction | **0.55** |

`allocateWorkspaceColumns` takes chrome (or `flexColumn: "canvas" | "chat"`).
Copy overflow/`protect`. In agent chrome, a third resize handle on the work
product column: `label="Resize document panel"` (fine even when Analytics is
showing — it is still that column).

Re-tune `workspace-layout.test.ts` (it currently asserts desktop chat max
`720`). Keep attachments-column bounds.

### 6.5 Direct apply + summary (report chat, agent chrome)

When chrome is `agent`, work product is `report`, composer is Agent:

1. `flushPendingSectionSaves` before POST. Pause autosave for the turn
   (`agentCommitInFlight`, same idea as `suggestionApplyTransition`).
2. Report edit tools write `report_sections` and return `status: "applied"`.
3. Do **not** insert `comments` rows.
4. Refresh the report after each apply so the right-hand (or centered)
   editors update with no Accept click.
5. If ≥1 apply succeeded, a **Changes this turn** block in the transcript:

   ```
   Changes this turn
   • Define · narrative — added the detection date from the batch record
   ```

   Deterministic from tool results + `reasoning`. Persist on
   `chat_messages.metadata` so the model does not see a fake message next
   turn. Link “Saved as version 4” once milestone 3 exists.

6. Analytics Agent turns do **not** use this summary/version path. They
   already mutate the worksheet. Do not double-wrap them.

`chat-panel.tsx` tool lines: `"applied"` → `"Applied to Define"`. Leave the
propose copy for document chrome.

### 6.6 Versions + compare (the report, not the worksheet)

History control on the **work product column** when the inner view is Report
(both chromes is fine; required in agent).

- List: version number, relative time, one-line summary, Agent source.
- Empty: “Versions appear after the assistant edits the document.”
- Compare: From / To, default previous vs latest. Read-only inline diff in
  the Report view. Banner `Comparing version 3 → version 5` + **Exit**.
- Same insert/delete colors as suggestion marks. **No** accept widgets.
- v1 has **no Restore**.
- Human typing does not create versions. Analytics writes do not create
  versions.

---

## 7. Architecture

```
Header chrome: document | agent          (column order)
Work product:  report | analytics        (what <main> shows)
Chat slot:     report chat | analytics chat   (follows work product)

Composer Agent + chrome=agent + view=report
        │
        ▼
POST /api/reports/:id/chat  { mode: "agent", workspaceChrome: "agent", ... }
        │
        ├─ search / read_section / …
        ├─ edit tools → commitChatEdit() → UPDATE report_sections
        │                 + recordSectionVersion (audit, existing)
        │                 + TurnEditLog
        ▼ turn end
   If TurnEditLog nonempty → document_revisions snapshot
                           → metadata.changeSummary
```

Analytics chat stays on `POST .../analytics/chat` with `chatSessions.surface
= "analytics"`. Do not merge the two assistants in v1. The *slot* is the
same; the *session* is not.

### 7.1 Do not use `sectionContentVersions` as History

Keep writing the audit chain. New tables for product versions:

```
documentRevisions
  id, reportId, revisionNo, source ('agent_turn'),
  chatSessionId, chatMessageId, summary, createdBy, createdAt

documentRevisionSections
  id, revisionId, section, content (jsonb), contentHash
```

Snapshot **every workspace section** plus `reports.metadata` (DV cover page)
at turn end. `hashSectionContent` already exists. Skip the row if the turn
applied nothing.

`pnpm db:generate`. Next SQL file after `0048_last_login_at.sql` is
**0049_…**. Driver stays `pg`.

### 7.2 Report commit path

```
src/lib/reports/persist-section.ts     extract from PATCH route
src/lib/ai/chat/commit-edit.ts         FOR UPDATE + applyAndAcceptRichEdit /
                                       applyRedraftToSection / applyTableOperation
```

Gemini can call two tools in parallel. Without `SELECT … FOR UPDATE` on
`report_sections`, the second read drops the first edit. Ingest already does
this. `db.transaction()` is required.

Locator failures stay `not_found` / `ambiguous` / … so the model retries.
Success status is `applied`. `canSaveReportSection` still gates writes.

When `propose` (document chrome): **today’s comment-insert behavior,
byte-for-byte.**

### 7.3 Prompt / tools

Pass `editPolicy` into `buildChatTools` / `buildChatSystemPrompt`. Derive it
on the **server** from `workspaceChrome` + `canSaveReportSection`. Do not
trust a client `editPolicy` on a locked report.

Commit copy: “applied immediately.” Delete “the engineer accepts or rejects.”
Bump `CHAT_PROMPT_VERSION`. Plan-mode allowlist does not gain edit tools.

Stub chat: same tool names; execute persists when policy is commit. E2E still
cannot assert tool choice.

### 7.4 Autosave vs commit

1. Flush pending section saves before the agent-chrome report turn.
2. `agentCommitInFlight` disables `useSectionSave`.
3. `refresh()` after each `applied` result and on turn end.
4. Clear the flag on finish / error / cancel.

If last-write-wins still shows up, then add a `version` on `report_sections`
(worksheets already have this). Reproduce first.

### 7.5 Inline diff

Do not use `buildRedraftPreviewDoc`. Do not diff into live editable TipTap.

`src/lib/document-revisions/inline-diff.ts` +
`src/components/report/document-revision-diff.tsx`.

Word-diff plain fields (`diff` package). Canonical flatten / prompt markdown
for rich fields. Cell-level highlight for tables. CSS = existing suggestion
insert/delete tokens.

```
GET /api/reports/[reportId]/revisions
GET /api/reports/[reportId]/revisions/diff?from=&to=
```

`loadAccessibleReport`. Compare empty / identical: “Pick two different
versions” / “No differences,” never a blank page.

---

## 8. How to ship (three PRs)

Each PR: CEO fold, detailed Summary, Test plan
(`.agents/skills/pr-human-tester-checklist`). Refresh on every push.

### Milestone 1 — Chrome + work product column (no apply change)

**Goal:** Header is Document | Agent. Work product column (center or right)
has Report | Analytics. Agent chrome is attachments | chat | work product.
Right panel resizes past 720px. Report chat still **proposes**. Analytics
chat still works in **both** chromes on the right (agent) or center
(document).

Files (expected):

- `report-workspace-header.tsx` — chrome tabs only. Remove Analytics from
  this header. Fix selected-state so Agent is not “not document.”
- New small `work-product-tabs.tsx` (or inline in workspace) — Report |
  Analytics, existing test ids.
- `report-workspace.tsx` — `WorkspaceChrome` + `WorkProductView`; flex
  order; `<main>` always owns editors + stats + `AttachmentCanvas`.
- `report-sidebar.tsx` — key analytics chat off `workProductView`.
- `workspace-layout.ts` + hook + resize handle — wider chat; preview
  bounds; leftover → chat in agent chrome.
- `workspace-layout.test.ts`.
- `e2e/helpers/workspace.ts` — chrome helper; analytics helper still clicks
  `report-surface-analytics` (now inside `<main>`).
- `e2e/report-editor.spec.ts` + `e2e/statistical-analysis.spec.ts` — Agent
  chrome keeps analytics on the **right**; Document chrome keeps it in the
  **center**; bounding boxes `docs.x < chat.x < canvas.x` in Agent.
- `CLAUDE.md` / `AGENTS.md` — Document | Agent chrome; Report | Analytics is
  a pane, not a mode.

**Do not** change tools, prompts, or schema.

Manual: switch Document ↔ Agent while Analytics is selected — worksheet and
analytics chat stay; only columns move. Switch back to Report — editors
still have unsaved typing.

### Milestone 2 — Report commit + change summary

**Goal:** Agent chrome + Report view + composer Agent writes the report. No
bubbles. Summary after the turn. Document chrome still proposes. Analytics
Agent unchanged.

Files (expected):

- `src/lib/reports/persist-section.ts` + `src/lib/ai/chat/commit-edit.ts`
  + tests (including two sequential commits on one section).
- `tools.ts` — branch on `editPolicy`.
- `system-prompt.ts` — bump version; `system-prompt.test.ts`.
- Chat route — `workspaceChrome` on the body; server derives policy.
- `chat-panel.tsx` — flush, busy flag, tool copy, Changes this turn.
- `use-section-save.ts` + `report-provider.tsx`.
- `tools.test.ts` — propose path inserts comments; commit path does not.

Schema / History can wait for milestone 3. Summary can live only in
transcript metadata until then.

### Milestone 3 — Document versions + compare

**Goal:** Each committing **report** turn creates a version. Compare two with
an inline diff in the Report view.

- Schema `0050_document_revisions.sql`.
- `src/lib/document-revisions/` + API under
  `src/app/api/reports/[reportId]/revisions/`.
- History + diff components on the work product column (Report view).
- Chat summary “Saved as version N”.
- `docs/database-schema.md` if it lists tables.
- `e2e/document-revisions.spec.ts` — seed two revisions, compare, Exit.
  Prefer a lib/test insert over Gemini.

No user-facing “Save version” button in v1.

---

## 9. Implementation notes

### Relocate, don’t duplicate, the analytics toggle

Today:

```tsx
showAnalyticsToggle && onSurfaceChange
data-testid="report-surface-document" | "report-surface-analytics"
```

Cut this block out of the header and paste it into the work product column.
Change labels Document → **Report** (header stole “Document”). Keep test ids.
`e2e/helpers/workspace.ts` `getByTestId("report-surface-analytics")` should
keep passing without a hunt.

### Flex order (sketch)

```tsx
<div ref={containerRef} className="relative flex min-h-0 flex-1">
  <div className="order-1 shrink-0" style={{ width: docsWidth }}>attachments</div>

  <main
    className={agentChrome ? "order-3 shrink-0" : "order-2 min-w-0 flex-1"}
    style={agentChrome ? { width: previewWidth } : undefined}
  >
    {statsEnabled ? <WorkProductTabs value={view} onChange={…} /> : null}
    …report editors (hidden/inert when view=analytics or file open)…
    …StatisticalWorkspace (hidden/inert when view=report or file open)…
    {viewingDocument ? <AttachmentCanvas /> : null}
  </main>

  <div
    className={agentChrome ? "order-2 min-w-0 flex-1" : "order-3 shrink-0"}
    style={agentChrome ? undefined : { width: chatWidth }}
  >
    <ReportSidebar workProductView={view} chrome={chrome} … />
  </div>
</div>
```

Resize: document chrome, chat handle `edge="start"` on the right column.
Agent chrome, work-product handle `edge="start"` on the right column.

### ReportSidebar

Replace `surface?: ReportWorkspaceSurface` with `workProductView`. The
`analyticsSurface ? <AnalyticsChatPanel> : <ChatPanel>` branch stays. Chrome
does not belong in this component except maybe “make the assistant full
width / hide collapse affordance in agent chrome” — optional, not required.

### Commit helper (sketch)

```ts
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

Re-run `checkProposedEdit` on the locked row so a prior tool in the same
turn cannot apply on a stale anchor.

### Changes-this-turn

```ts
metadata.changeSummary?: {
  revisionNo?: number;
  items: { section: string; targetField: string; reasoning: string }[];
}
```

Append a card at the end of that assistant message in `ChatPanel` only.

---

## 10. Tests (minimum)

### Vitest

| Area | Cases |
|---|---|
| Bounds | 1280 / 1920 / 1024 chat max after the raise; agent leftover → chat; preview clamp; overflow |
| Header | Chrome Document \| Agent; **no** Analytics tab; Agent selected does not select a ghost Analytics |
| Work product tabs | Report vs Analytics; hidden when stats off |
| Commit | rich + plain happy path; `not_found`; two sequential edits; `canEdit false`; generic_document has no pending marks |
| Tools | `propose` still inserts comments; `commit` does not |
| Prompt | version bump; commit copy only for that policy |
| Diff | insert, delete, equal, table cell |

Mock `@/db` when the module loads `DATABASE_URL`.

### Playwright

- Milestone 1: open report, click Agent — `docs.x < chat.x < canvas.x`.
  Click Analytics — worksheet is in the **right** column, chat still center,
  analytics composer visible. Click Document chrome — worksheet is **center**,
  chat right. Keyboard-resize the right panel past the old 720px cap on a
  ~1600px viewport. `e2e/statistical-analysis.spec.ts` still finds
  `report-surface-analytics`.
- Milestone 2: Agent chrome still streams (`e2e/report-chat.spec.ts`).
  `e2e/suggestion-accept.spec.ts` still green in Document chrome.
- Milestone 3: History chrome + ins/del + Exit.

`--project=chromium`. `afterEach` `deleteReport`.

Stub chat cannot prove `propose_edit` was chosen. Do not E2E-wait on
“Applied to Define” without seeding. Unit-test commit instead.

---

## 11. Pitfalls

1. **Leaving Analytics on the header** as a peer of Document and Agent.
2. **Unmounting editors, stats, or chat** on chrome switch.
3. **Keying analytics chat off chrome** so Agent+Analytics still talks to
   the report assistant (or vice versa).
4. **`sectionContentVersions` as History** — autosave spam.
5. **Parallel tool applies** without `FOR UPDATE`.
6. **Autosave overwriting a commit** with stale TipTap JSON.
7. **Leaving `ai_fix` comments in commit mode** — they reappear when you
   switch back to Document chrome.
8. **Hardcoding DMAIC.**
9. **Plan-mode allowlist** accidentally gaining commit tools.
10. **Merging analytics sessions into report chat** (`chatSessions.surface`).
11. **Versioning worksheet writes.**
12. **Turbopack 404** on new routes — restart `pnpm dev`, optionally
    `rm -rf .next`.
13. **Bare `<ViewTransition>`** fading the shell on every tab click. Use
    `default="none"`. Isolate the header if needed. No layout-level VT
    wrapping `{children}`.
14. **Trusting `editPolicy` from the client** on a locked report.

---

## 12. Out of scope (v1)

- Restore / revert a version.
- Product versions for human typing, manager track-changes, or analytics.
- One unified assistant that edits both the report and the worksheet.
- Split-pane Report *and* Analytics visible at once (tabs, not two stacks).
- Collaborative live cursors.
- Improve AI, eval traffic lights, Word export behavior.
- Mobile layout.
- Persisting Document | Agent across reloads.
- Side-by-side compare.

---

## 13. Docs to update when the feature ships

In the milestone that lands the UI, not in this plan file’s PR:

- `CLAUDE.md` — chrome vs work product view; agent commit vs document
  propose; `documentRevisions` vs `sectionContentVersions`.
- `AGENTS.md` — one line: Analytics is a pane of the work product column.
- `.cursor/rules/chat-and-attachments.mdc` — `editPolicy`.
- `.cursor/rules/database.mdc` — new tables.
- `TESTING.md` — new e2e spec.
- `docs/database-schema.md` if it enumerates tables.

---

## 14. Suggested first day

1. Open a draft. Note Document | Analytics in the **header** — that control
   is moving into the canvas. Drag the right chat handle; it stops near
   720px. Milestone 1.
2. Switch to Analytics, then imagine the worksheet sitting on the **right**
   with chat still in the middle. That is Agent chrome. You should not have
   to leave Agent to see analytics.
3. Send a report-chat Agent message, accept the bubble. Milestone 2 removes
   Accept **only** for report chat in Agent chrome.
4. Land milestone 1. Confirm Analytics works in both chromes on a preview.
   Then start commit.

---

## 15. Definition of done (all three milestones)

- Header is Document | Agent only. Report | Analytics lives on the work
  product column.
- Agent chrome: attachments | chat | work product. Analytics uses that same
  right column.
- Switching chrome does not reset Report vs Analytics and does not lose
  chat or editor state.
- Right panel in both chromes drags past today’s 720px chat cap on a
  1440–1920px window.
- Agent chrome + Report view: assistant Agent edits appear with no Accept
  and no bubbles. Switching to Document chrome does not show those edits as
  pending suggestions.
- Document chrome still proposes + accepts (regression).
- Analytics Agent still fills the worksheet in both chromes (regression).
- Successful report-agent turns show a change summary and a History row.
- Compare shows inline ins/del; Exit returns to the live report.
- Ask never writes the report. Locked / view reports never commit.
- `pnpm precommit` green. Chromium e2e for layout + analytics pane + history
  chrome green.

### CEO-facing tests (put these on the milestone PRs)

- **CEO** — Toggle Document vs Agent. In Agent, chat is the main thing; the
  report is on the right. Open Analytics without leaving Agent — the
  worksheet should take that same right column.
- **CEO** — Drag the right edge further than before in both Document and
  Agent.
- **CEO** — In Agent, on the report, ask the assistant to add a sentence. It
  appears without Accept. Chat lists what changed.
- **CEO** — History: compare the last two versions in place, then leave
  compare.
- **CEO** — Back in Document chrome, new chat edits still use bubbles /
  Accept.
