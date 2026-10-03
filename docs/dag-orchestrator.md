# DAG orchestrator (later)

Status: **not implemented**. Living plan for a follow-up PR after the stacked
QSR PRs merge (`#451` / `#453` / `#455`). Trust this file for intent; trust
the code once a branch exists.

`#455` already shipped a **mini orchestrator** for QSR Tables 5–10
(`draft_rtm_table` / `runRtmDraft`). Keep that graph (identity, then four
family columns in parallel, then one card). Do not add a second RTM path.
The later PR **moves that mini orchestrator onto the general DAG** and
uses Tables 5–10 as the first recipe and the test: if “draft table 5”
runs through the DAG and IQ matches typed “draft the IQ column,” the
executor is real. Nested Flash-Lite jobs (`runRtmFamilyJob`, 90s) are
what get replaced inside that graph — see
`docs/qsr-rtm-parallel-drafting-plan.md`.

This is not [PR #413](https://github.com/sachin-aag/andrei/pull/413)
(*Fan URS retrieval into parallel queries, and plan multi-part drafts*),
closed unmerged. Do not reopen it. Parallel *search* inside one chat turn
is not an orchestrator.

---

## 1. Why

Typed **“draft the IQ column for table 5”** already does the right work:
Gemini 3.7 Flash, thinking medium, `search_documents` / `read_document_page` /
`edit_table`, no inner 90s cap, one family, one isolate.

**“Draft table 5”** needs that same work four times (DQ, IQ, OQ, PQ) after
identity is known, plus the identity rows themselves. Nesting four Agent
turns inside `POST /api/reports/[id]/chat` cannot work:

| Envelope | Cap |
|----------|-----|
| Chat route `maxDuration` | 300s |
| `CHAT_SERVER_ABORT_MS` | 270s from request start |
| Hobby Fluid Compute | still kills at 300s even if Pro raises `maxDuration` |

Raising the chat timeout does not fix it. Identity plus four Agent-quality
family fills is several 270s envelopes, not one.

Target: a **general** orchestrator that emits a task list as an **adaptive
DAG**, and **subagents** that do the work. The Tables 5–10 mini orchestrator
is the first recipe **and** the proving test. Remaining-section
(`kind: "section_queue"`) is the linear ancestor of the same JSON.

---

## 2. Picture

```
typed prompt
    → orchestrator (no cell writes)
        → persist DAG on chat_sessions.pending_plan
        → start durable executor
    → subagent per ready node (Agent-quality, own 270s)
        → write scratch + output JSON
    → orchestrator reads outputs, rewrites DAG
    → compose one suggestion card
```

Three roles:

| Role | Model / tools | Duration | Writes |
|------|----------------|----------|--------|
| Orchestrator | Cheap / none. Typed recipe first; planner LLM later | Seconds | DAG JSON only |
| Subagent | Same as live Agent (`resolveChatLanguageModel`), grep / read / `edit_table` | Own 270s isolate | Scratch for that node |
| Compose | Deterministic | Short step | One `ai_fix` card |

DQ / IQ / OQ / PQ are independent once identity exists. They are four nodes
with `dependsOn: [identity]`, not one worker with four columns.

First RTM graph:

```
identity
   ├─ dq
   ├─ iq
   ├─ oq
   └─ pq
        └─ remarks? → compose (one card)
```

---

## 3. Leave the 270s isolate

The typed chat POST **seeds** the DAG. It must not run four Agents. Use the
same split ingest already has: request starts work; durability is outside SSE.

**Production executor: Vercel Workflow** (`"use workflow"` / `"use step"`),
already used by `documentIngestWorkflow` (`src/workflows/document-ingest.ts`).
Each DAG node is one `"use step"`. After `await`, the workflow body can
insert, skip, or split nodes. The workflow can outlive 270s; each step still
has a ~300s cap, which is what one IQ column needs.

```ts
export async function reportDraftWorkflow(sessionId: string) {
  "use workflow";
  for (;;) {
    const dag = await loadDagStep(sessionId);
    if (dag.paused || dag.idle) return;
    const ready = readyNodes(dag); // dependsOn every done
    const results = await Promise.all(
      ready.map((node) => runDagNodeStep(sessionId, node.id))
    );
    await adaptAndPersistDagStep(sessionId, results);
  }
}
```

**Preview / local fallback:** World queues stall on preview. Ingest already
defaults preview to `DOCUMENT_INGEST_MODE=inline`. For draft, inline = the
remaining-section pattern: persist DAG, client POSTs `Continue…` **once per
node**. Do not run four Agents inside one continue. If `start()` fails, fall
back the same way `startDocumentIngest` falls back to `after()`.

Do not make the browser the production scheduler. Closing the tab should not
kill IQ.

Do not nest four Agent-quality jobs in the chat isolate. Do not add a 90s
Flash-Lite inner budget (`RTM_WORKER_BUDGET_MS`) as a substitute.

---

## 4. Persist an adaptive DAG

Generalize `chat_sessions.pending_plan` past `kind: "section_queue"`. Keep
the linear queue working as a special case.

```ts
type ChatDagNode = {
  id: string;
  kind: "review" | "identity" | "family_column" | "remarks" | "compose";
  label: string;
  state: "queued" | "ready" | "running" | "done" | "blocked" | "skipped";
  dependsOn: string[];
  input: unknown;   // section, family, ursIds, attachmentIds
  output?: unknown; // cells, leftover ids, "protocol_missing", abort
};

type ChatPendingPlan = {
  kind: "task_dag";
  objective: string;
  nodes: ChatDagNode[];
  paused?: boolean;
  pauseReason?: string;
};
```

Adapt **after** a node, from `output`, not from a pre-baked graph:

- Identity returns 33 URS IDs → family nodes get those IDs (unknown at seed
  if review was thin).
- Identity returns 0 → insert `review` (URS walk), then re-queue identity.
  Do not start DQ.
- IQ: `protocol_missing` → skip IQ, leave cells empty, do not block DQ/OQ/PQ.
- IQ hits 270s with leftover IDs → enqueue `iq#2` with the remainder. That
  split replaces any inner 90s budget.
- IQ finds row-level N/A → Remarks can mark those rows NA; others stay open
  for OQ/PQ.
- Compose waits on identity + the four families (skipped counts as done).

First recipes are **code**, not a free-form planner. `qsr_rtm_table` is
not a sketch — it is today’s `runRtmDraft` graph, persisted as DAG nodes
instead of `Promise.all` inside the chat isolate:

1. `qsr_rtm_table` — identity → {dq, iq, oq, pq} → remarks → compose
   (the `#455` mini orchestrator; first recipe; acceptance test)
2. `section_queue` — today’s remaining-section list, same JSON
3. Later: a planner LLM that may only emit `kind`s from that registry

A general orchestrator that invents arbitrary tools/graphs will fight
Plan-mode allowlists and grounding. Typed nodes, adaptive edges.

---

## 5. Subagent = “draft the IQ column”

`runDagNodeStep` is a **scoped Agent turn**, not `generateText` +
`submit_family_cells`:

- Model: `resolveChatLanguageModel()` (3.7 Flash, thinking medium). Not
  `resolveChatExtractLanguageModel()` (Flash-Lite).
- Tools: the live write set, scoped (`search_documents` pinned to that
  family’s attachments, `edit_table` or a scratch writer). Off Plan, same as
  `edit_table`.
- Prompt: “Fill Reference – IQ for table 5 for these URS rows.” Same bar as
  the typed ask.
- Stop: column complete, Cancel, or **this step’s** 270s — not a 90s inner
  timer.
- Stub/Vitest: skip LLM, same as `#455`.

Grain is **one family × one table**, not all rows in a lite worker and not
one row per isolate unless `adapt()` splits leftovers.

---

## 6. One card

`edit_table` still proposes; it does not commit. Four parallel Agents calling
`edit_table` on the live section create four cards that supersede each other
(`dismissSuggestionsSupersededBy`). Identity-then-family on the live doc also
fails if the identity card is not Applied.

Keep the `#455` compose rule: subagents write **scratch** (DAG `output` or a
small JSON blob keyed by session+section). Compose is a short step that
builds one `insert_rows` / `edit_cells`, grounds identity-first, and opens
**one** suggestion. Optional later: the card updates in place as families
finish (poll `pending_plan`, refresh comments).

Grounding stays on `edit_table` / `groundDraftText`. Do not add a second
persist path. Parallel family steps must not PATCH the same
`report_sections` row.

---

## 7. UI

Extend the remaining-section widget (`ChatPlanProgress`), still below the
transcript:

- Collapsed: `Table 5 — IQ 12/33`
- Expand: identity done, DQ/IQ/OQ/PQ running or queued, compose pending
- Chip spins only while a node is running
- Cancel / new typed prompt pauses the DAG; Resume continues
- Do not persist “The assistant stopped before finishing” when the next node
  will run

The typed “draft table 5” turn should seed the DAG, maybe run identity if it
fits, then end the SSE. Working… must not outlive an idle stream.

Cancel, `sessionVersion`, and AI budget still gate every step.

---

## 8. Port the Tables 5–10 mini orchestrator (first recipe + test)

`#455` is not a throwaway. After the stacked QSR PRs merge, `runRtmDraft`
already is a mini orchestrator:

```
draft_rtm_table
├── planRtmDraft          no LLM: reviewed URS IDs − live rows
├── runRtmIdentityJob     URS ID / Parameters / User requirements
├── Promise.all           four runRtmFamilyJob (Flash-Lite, 90s)  ← replace
├── composeRtmOperations  insert_rows + edit_cells
└── persist via edit_table  identity-first ground, one card
```

The later PR **rewires that graph onto the DAG**. Same tool name
(`draft_rtm_table`), same step-policy force on a focused RTM table, same
Plan-mode exclusion, same one-card persist. The chat isolate only **seeds**
the DAG (plan + maybe identity). Family nodes and compose run as durable
steps. There is no second “draft table 5” path.

### Keep (call from DAG nodes; do not rewrite)

| Piece | Why |
|-------|-----|
| `draft_rtm_table` tool + `inScopeRtmSection` step policy | Still the only write tool on a focused Table 5–10 |
| `planRtmDraft` / leftover missing IDs | Deterministic checklist; wrap-up still cannot skip IDs |
| `runRtmIdentityJob` | Identity from reviewed URS quotes, no family cells |
| `composeRtmOperations` / `identityOnlyOperation` | One card; identity grounds first; family cells clear instead of blocking |
| `withRtmDraftLock` | One draft per report+section |
| Off Plan allowlist, stub/Vitest skip LLM | Unchanged |

### Replace (same node, different worker)

| Today | DAG |
|-------|-----|
| `runRtmFamilyJob` Flash-Lite + `submit_family_cells` | Family `family_column` subagent = typed “draft the IQ column” (3.7 Flash, grep/read/`edit_table` or scratch, own 270s) |
| `RTM_WORKER_BUDGET_MS = 90_000` nested under chat abort | No inner 90s. Leftover IDs become `iq#2` via `adapt()` |
| `Promise.all` of four jobs in `runRtmDraft` | Four ready DAG nodes, `Promise.all` of `"use step"` (or one continue POST each on preview) |
| Family results held in memory until persist | Scratch on the node `output`; compose reads all four |

### Delete once the DAG IQ node matches typed IQ

`runRtmFamilyJob`, `submit_family_cells`, `RTM_WORKER_BUDGET_MS`,
`RTM_WORKER_MIN_START_MS`. Do not leave a fallback that still one-shots
Flash-Lite inside the chat turn.

### Tables 5–10 is the test of the general executor

Do not invent a synthetic DAG to prove the orchestrator. The test **is**
the mini orchestrator:

1. **Vitest (CTO, no LLM):** `planRtmDraft` still lists every reviewed ID;
   identity-only compose still opens one card; `adapt()` after
   `protocol_missing` / leftover IDs / 0-identity still rewrites the graph;
   `draft_rtm_table` still seeds `kind: "task_dag"` and does not call
   `runRtmFamilyJob`. Reuse `rtm-draft-plan.test.ts`, `rtm-compose.test.ts`,
   `rtm-draft-loop.test.ts`, `qsr-rtm-draft-replay.test.ts`,
   `step-policy.test.ts`. Replay `draft_rtm_table` through `buildChatTools`
   remains the gold floor.
2. **CEO (preview):** `@` Table 5 “draft table 5” lands every reviewed URS
   ID (the `#455` bar, still). Then IQ on that card matches a follow-up
   “draft the IQ column for table 5” — `{section} – {audit line}` from the
   protocol body page, not `12.1` reused, not cover cites. DQ / OQ / PQ
   can finish after IQ (widget shows the DAG). One suggestion card. Cancel
   pauses; Resume continues IQ leftovers as `iq#2`.
3. **Regression:** typed “draft the IQ column” alone still works when the
   table already has identity rows (DAG family node or live Agent
   `edit_table` — same quality). Purpose / References still do not load
   `draft_rtm_table`. Plan mode still has no write tools.

If Table 5 IQ through the DAG is worse than the typed IQ ask, the
orchestrator is not done. Do not expand to remaining-section or a planner
LLM until that test passes.

Until the DAG ships, typed “draft the IQ column” remains the quality path
for a single family. Empty or NA family cells on a `#455` first card are
acceptable; a copied wrong heading is not.

---

## 9. Implementation order (later PR)

New branch off `main` after the stack merges. Do not pile this onto `#455`.

1. Persist `kind: "task_dag"` next to `section_queue`; keep the linear queue
   working.
2. Extract “one scoped Agent turn” so the chat route and a Workflow step
   share it.
3. `reportDraftWorkflow` + preview auto-continue fallback (ingest mode
   switch). Node I/O (pg, crypto, GCS) stays in `"use step"`, not the
   workflow body — same constraint as ingest.
4. **Port `runRtmDraft`:** `draft_rtm_table` seeds the RTM recipe
   (identity → four family nodes → compose). Family nodes are Agent-quality.
   Keep plan / identity / compose / persist helpers.
5. DAG widget + Cancel/Resume (extend `ChatPlanProgress`).
6. **Pass the Table 5–10 test** (section 8). Then delete `runRtmFamilyJob` /
   `RTM_WORKER_BUDGET_MS`.
7. Fold remaining-section into the same executor.
8. Only then consider a planner LLM over the node registry.

---

## 10. What not to build

- Do not add a second Tables 5–10 write path beside `draft_rtm_table`.
- Do not reopen `#413` (parallel URS-band search as the orchestrator).
- Do not raise chat `maxDuration` so four Agents fit in one isolate.
- Do not keep Flash-Lite / `submit_family_cells` / a 90s budget as a
  fallback IQ worker.
- Do not let four family `edit_table` calls each open a card.
- Do not wait for Apply between identity and family (scratch, then compose).
- Do not persist “The assistant stopped before finishing” when the next node
  will run.
- Do not put write tools on the Plan-mode allowlist.
- Do not skip LLM workers in a way that Vitest/`ALLOW_TEST_STUB_CHAT` start
  calling Flash.
- Do not call the orchestrator done on remaining-section or a planner until
  Table 5 IQ through the DAG matches typed “draft the IQ column.”

---

## 11. Pointers

| Existing piece | Role |
|----------------|------|
| `src/lib/ai/chat/pending-plan.ts` | Linear remaining-section queue; auto-continue text |
| `src/components/report/chat-panel.tsx` | `CHAT_AUTO_CONTINUE_TEXT` + `ChatPlanProgress` |
| `src/lib/ai/chat/assistant-turn.ts` | `CHAT_SERVER_ABORT_MS` (270s) |
| `src/app/api/reports/[reportId]/chat/route.ts` | `maxDuration = 300` |
| `src/workflows/document-ingest.ts` | Durable `"use workflow"` / `"use step"` |
| `src/lib/attachments/document-ingest-mode.ts` | Preview = inline, else workflow |
| `src/lib/ai/chat/rtm-draft.ts` | Mini orchestrator to **port** (`draft_rtm_table` still seeds) |
| `src/lib/ai/chat/rtm-draft-plan.ts` | Keep: deterministic URS checklist |
| `src/lib/ai/chat/rtm-identity-job.ts` | Keep: identity node |
| `src/lib/ai/chat/rtm-compose.ts` | Keep: one-card compose |
| `src/lib/ai/chat/rtm-family-job.ts` | Flash-Lite job to delete after Table 5 IQ test passes |
| `src/lib/ai/chat/qsr-rtm-draft-replay.test.ts` | Gold floor; replay still goes through `draft_rtm_table` |
| `docs/qsr-rtm-parallel-drafting-plan.md` | Mini-orchestrator graph; family jobs are the part to move |
| `docs/document-ingest-pipeline.md` | Workflow vs `after()` fallback |
