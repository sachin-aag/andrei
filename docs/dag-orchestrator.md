# DAG orchestrator (later)

Status: **not implemented**. Living plan for a follow-up PR after the stacked
QSR PRs merge (`#451` / `#453` / `#455`). Trust this file for intent; trust
the code once a branch exists.

This is not the nested Flash-Lite family workers on `#455`
(`docs/qsr-rtm-parallel-drafting-plan.md`). That dispatcher lands every
reviewed URS ID in one card; its DQ / IQ / OQ / PQ jobs are a different
product from “draft the IQ column.” Do not polish them toward this design.

This is also not [PR #413](https://github.com/sachin-aag/andrei/pull/413)
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
DAG**, and **subagents** that do the work. First recipe is QSR Tables 5–10.
Remaining-section (`kind: "section_queue"`) is the linear ancestor of the
same JSON.

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

First recipes are **code**, not a free-form planner:

1. `qsr_rtm_table` — identity → {dq, iq, oq, pq} → remarks → compose
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

## 8. What `#455` already ships (do not redo)

After the stacked QSR PRs merge, main will have:

- References (Table 1): inventory review + per-row search before a number
  lands
- Tables 5–10: `draft_rtm_table` lands every reviewed URS ID from ledger
  quotes, one suggestion card, ungrounded family cells do not kill identity
- Nested Flash-Lite family jobs (`runRtmFamilyJob`, 90s,
  `submit_family_cells`) as a same-turn attempt at DQ/IQ/OQ/PQ

The follow-up **deletes** `runRtmFamilyJob` once DAG nodes exist. Until then,
typed “draft the IQ column” remains the quality path for a single family.

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
4. RTM recipe only: identity → four family subagents → compose.
5. DAG widget + Cancel/Resume.
6. Delete `runRtmFamilyJob` / `RTM_WORKER_BUDGET_MS`.
7. Fold remaining-section into the same executor.
8. Only then consider a planner LLM over the node registry.

---

## 10. What not to build

- Do not reopen `#413` (parallel URS-band search as the orchestrator).
- Do not raise chat `maxDuration` so four Agents fit in one isolate.
- Do not use Flash-Lite / `submit_family_cells` / a 90s budget as the IQ
  worker.
- Do not let four family `edit_table` calls each open a card.
- Do not wait for Apply between identity and family (scratch, then compose).
- Do not persist “The assistant stopped before finishing” when the next node
  will run.
- Do not put write tools on the Plan-mode allowlist.
- Do not skip LLM workers in a way that Vitest/`ALLOW_TEST_STUB_CHAT` start
  calling Flash.

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
| `src/lib/ai/chat/rtm-draft.ts` | `#455` dispatcher to replace |
| `src/lib/ai/chat/rtm-family-job.ts` | Flash-Lite job to delete |
| `docs/qsr-rtm-parallel-drafting-plan.md` | Nested-worker attempt; not the destination |
| `docs/document-ingest-pipeline.md` | Workflow vs `after()` fallback |
