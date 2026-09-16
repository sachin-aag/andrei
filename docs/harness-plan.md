# Chat harness plan (from the `dev 6` session)

Living plan for the **agent harness**: what we resend per step, which
heuristics decide tool availability, and how retrieval ranks pages.
Retrieval-internal phases (ingest → chunk → rank) stay in
[`retrieval.md`](retrieval.md); this file is the layer above it.

The rule for this plan: **subtract first**. The harness grew one guard,
one regex, and one prompt paragraph per incident. Most items below remove
code. Every item that adds code names what it retires.

## 1. What `dev 6` actually cost (measured, not estimated)

Langfuse v2 metrics, observations filtered on `metadata.documentNo = "dev 6"`:

| Leaf generation | Calls | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| `report-chat` orchestrator steps | 319 | 53,208,074 | 111,012 | **$20.93** |
| Document-review page extracts | 53 | 84,436 | 17,494 | $0.07 |
| Criteria eval | 26 | 50,584 | 4,551 | $0.02 |
| Suggestions | 7 | 40,349 | 12,557 | $0.23 |
| Draft entailment | 64 | 35,583 | 2,974 | $0.02 |

By model the session is $22.83, of which the `report-chat:ai.streamText`
parent spans are $1.45 of double-counted rollup — call it **~$21.4 of real
spend, and the orchestrator is $20.93 of it**.

Three numbers drive everything below:

1. **Input : output is 479 : 1.** The model barely writes. It *reads*.
2. **167k input tokens on the average step**, 35 turns / 319 steps
   (9.1 steps per turn). The worst turn ran 20 steps at **475k input
   tokens per step** and cost **$3.10 by itself**.
3. Per-step input is roughly `system prompt + tool schemas + every tool
   result so far this turn`. Only the first two are bounded today.

So the harness is not expensive because it thinks too hard. It is
expensive because **every step resends the whole turn**, and because bad
retrieval adds steps that each resend more. Ranking work matters mostly
through step count.

## 2. What the harness weighs today (measured)

| Thing | Size |
|---|---|
| `src/lib/ai/chat/*.ts` (non-test) | 16,998 lines |
| `src/lib/ai/chat/*.test.ts` | ~15,000 lines |
| `tools.ts` | 3,752 lines, 14 tools |
| Tool `description` + `.describe()` text | ~14.6 KB ≈ **3.7k tokens every step** |
| `system-prompt.ts` template literals | ~43.6 KB ≈ **up to 10.9k tokens** (`CHAT_PROMPT_VERSION` is on its 106th named revision) |
| Turn classifiers | `user-intent.ts` (387 lines, 55 regexes), `retrieval-policy.ts` (252 lines, 30 regexes), `resolve-user-intent.ts`, `already-drafted.ts`, `section-intent.ts` |
| Page/objective scorers | `review-page-plan.ts`, `inventory-review-schema.ts`, `attachment-divider.ts`, `retrieval-route.ts`, `retrieval-query.ts` |
| `prepareStep` gates in the report chat route | **7** independent gates mutating `activeTools` |

The seven gates are `userIntent` → `tableEditLoopDirective` →
`alreadyDraftedReadStep` → `tableSchemaReadStep` →
`prepareDocumentReviewStep` → `searchLoopDirective` →
`documentAskUserDirective`, then `withoutDraftFieldTools`. They are
written independently, run in a fixed order, and each one answers a
slightly different version of the same question: *which tools may the
model call on this step?*

There are effectively **two control planes** saying the same thing: server
heuristics that hide tools, and prompt copy that asks the model not to use
them. Every incident has added one of each, plus a test.

## 3. Design rules for this plan

1. **Net-negative lines.** Target `src/lib/ai/chat` non-test under
   **14,000 lines** (from 16,998) when this plan is done.
2. **One control plane per decision.** If the server can enforce it, the
   prompt does not repeat it. `intentToolAvailabilityRule` already tells
   the model generically which tools are absent — that is the pattern.
3. **No new heuristic without a retirement and a case.** A new regex or
   scorer must (a) name the rule it replaces and (b) ship with an eval
   case that fails before and passes after. If the case does not move,
   the heuristic does not merge.
4. **Cost is a test result.** Tokens-per-step and steps-per-turn are
   regression metrics, not vibes (§9).
5. **Bounded payloads beat clever prompts.** A tool result that cannot
   exceed N tokens removes the need for prose telling the model to ignore
   most of it.

## 4. Workstream A — Context diet (the biggest lever; mostly subtraction)

Goal: cut median input tokens per step from **167k to under 60k** without
losing any grounded fact.

- **A1. Compact the *current* turn, not just past turns.**
  `compactChatToolHistoryForModel` only shrinks persisted history before
  `convertToModelMessages`. Within a turn, step 12 still resends the raw
  results of steps 1–11. AI SDK 6.0.182 `prepareStep` can return
  `messages`, and the SDK ships `pruneMessages`. Apply the same digest
  rules in-turn: a `search_documents` result older than two steps becomes
  its citation list; a consumed `read_document_page` becomes the quoted
  span the draft used; `finish_document_review` becomes its
  `citationDigest`. This is the single change most likely to halve the
  session cost.
- **A2. Budget every tool result.** Cap the bytes each tool may return
  (`search_documents` 16 hits × ~900-char excerpts, `read_section` labeled
  R#/C# grid, `read_document_page` full transcript, `finish_document_review`
  findings). One shared `toolResultBudget` helper, applied at the tool
  boundary, replaces per-tool ad-hoc slicing.
- **A3. Stop rewriting the tool block every step.** Seven gates mutate
  `activeTools` step to step. Besides being hard to reason about, a
  changing tool block changes the request prefix, which is the part a
  provider-side implicit cache can reuse. **Verify first** whether Vertex
  reports cached input tokens for these calls; if the prefix is not being
  reused, a stable per-turn tool set is worth more than any ranking tweak
  at 167k tokens/step. Prefer *one* decision at turn start plus a small
  number of phase transitions.
- **A4. Prompt diet.** Measure the assembled prompt per pack/document
  type (it is conditional; 10.9k tokens is the ceiling, not the mean),
  then delete every block that restates a server-enforced guard or a
  fixed incident. Target −40% assembled tokens. Bump
  `CHAT_PROMPT_VERSION` once for the whole diet, not per block.
- **A5. Tool-schema diet.** ~3.7k tokens of description text rides along
  every step. Descriptions should say what a tool does and what it
  returns; they should not carry retrieval policy, loop advice, or
  incident history (`SEARCH_COVERAGE_HINT` is seven sentences of loop
  policy attached to every search result).

## 5. Workstream B — Delete dead and duplicated harness

- **B1. The `commit` edit policy is dead code.** `deriveChatEditPolicy`
  unconditionally returns `"propose"` (it `void`s both arguments). Yet
  `commit-edit.ts` (173 lines), the `ChatEditPolicy` union, and
  `editPolicy === "commit"` branches in `tools.ts`, `system-prompt.ts`,
  and `charts/plot-measurements.ts` all still exist, plus their tests and
  prompt copy. Delete the union, the module, the branches, the copy.
- **B2. One step policy, not seven gates.** Replace the gate chain with a
  single `chatStepPolicy({ phase, intent, steps })` returning
  `{ activeTools, toolChoice }`, with a table of transitions and one
  colocated test file. The existing rules become rows, not modules. This
  is where `search-loop.ts`, `table-schema.ts`, `already-drafted.ts`, and
  `prepareDocumentReviewStep`'s tool-hiding half converge.
- **B3. One turn plan, not five classifiers.** `classifyChatUserIntent`,
  `classifyRetrievalPolicy`, `resolveChatUserIntent`,
  `detectSectionIntentFromText`, and the pushback/keep-going regexes all
  read the same user turn with overlapping patterns (85 regexes between
  the first two). Compute a single `TurnPlan` once per request —
  `{ intent, retrievalPolicy, scope, reviewObjective }` — and let
  everything downstream consume it. Delete the per-consumer re-derivation.
- **B4. Retire heuristics the eval cannot defend.** Candidates:
  APS/calibration-specific divider regexes in `attachment-divider.ts`,
  `requirementIndex` TOC demotion, the needle tables in
  `inventory-review-schema.ts`. For each: write the case first. If a
  rarity-based score (D2) covers it, delete the special case.
- **B5. Dedupe page-objective scoring.** `review-page-plan.scoreReviewPage`,
  `inventory-review-schema.scoreInventoryReviewPage`, and
  `retrieval-route.routeSearchTargets` each answer "does this page match
  this objective" with different signals. One scorer, three callers.

## 6. Workstream C — Placeholder fill as a first-class path

This is the cost bug the session kept hitting: a table with rows and
`<date>` / `<identifier>` placeholders is a **closed set of lookups**, but
the harness escalated it to `start_document_review` and walked hundreds of
pages. Net effect of this workstream is a deletion: the escalation branch
for partially-filled tables goes away.

- **C1. Targeted fill retrieval.** Build queries deterministically from
  the placeholder scan we already run (`src/lib/placeholders`): row key
  cells + column header + section context, one query per placeholder,
  batched through the existing `searchReportDocumentsMany`. No LLM in the
  query builder.
- **C2. A partial table never forces a page walk.**
  `inScopeEmptyInventoryNeedsReview` must stay strictly about *empty*
  inventories. Placeholders in a populated table route to C1.
- **C3. Ground the fill.** Pages retrieved by C1 seed the
  `CitationPageLedger` in the same turn, so MJ's `block` policy has real
  quotes and stops returning `unsupported_facts` on facts that are in the
  PDFs.
- **Done when:** a "fill the placeholders in tables 9–11" turn completes
  in **≤4 steps** with no `start_document_review`, and the cited pages
  match the pages a human would open.

## 7. Workstream D — Ranking (small code, gated by cases)

Ranking is not the main cost lever, but wrong hits buy extra steps, and
every extra step costs a full context resend.

- **D1. MJ document numbers are identifiers.** `requirementIds()` only
  matches dash forms (`SW-LWB-4`); MJ's `PMC/PR/014`, `SOP/DP/QA/014` fall
  through to semantic search and rank against every cover page. Add the
  slash form at **query time first** so ready files do not need
  re-ingest; only bump `PARSER_VERSION` if the page-column path proves
  necessary.
- **D2. Rarity beats special cases.** `lexicalMatchScore` weights every
  token equally, so "equipment", "system", and "report" pull cover pages
  to the top. Add a per-report document-frequency damp. If it works, it
  retires hand-written cover/header demotions (B4).
- **D3. Per-file diversity cap.** At most two hits per file in the top
  `limit` unless the query is a file locator, so one 273-page attachment
  cannot occupy all eight slots.

Each lands with its own case in `scripts/eval/retrieval-cases.json` (or
the private overlay for MJ-shaped documents). Non-goals from
`retrieval.md` stay locked: no cross-encoder, no cap raises, no
force-reindex.

## 8. Workstream E — Honest coverage, fewer dead ends

- **E1. `finish()` must not claim complete coverage it does not have.**
  `DocumentReviewSession.finish()` returns `status: "complete"`,
  `truncated: false` based only on an empty queue. `start_document_review`
  already knows about `skippedDocuments`; that fact never reaches finish,
  and the `coverageKey` is built from queued pages only — so a partial
  file set can be rehydrated later as complete coverage. Carry skipped
  documents into finish and into the coverage key.
- **E2. `needs_attachment_scope` should not be a dead end.** When the tool
  returns it, force `list_attachments` on the next step instead of
  emitting advice the model has already ignored.
- **E3. Budget, then finish — do not abort.** Two turns hit the 270s
  server abort. Make the continue budget aware of elapsed turn time and
  emit a partial finish (with honest `truncated`) rather than losing the
  turn.

## 9. Workstream F — Measure the harness, not just recall

The retrieval eval answers "did we return the right page." Nothing today
answers "did the turn cost $3.10." Add a turn-level harness:

- **F1. Scenario runs** over a handful of recorded turns (placeholder
  fill, inventory draft, single-sentence rewrite, greeting) reporting
  **steps, tool calls, input tokens, and cost**, with budgets that fail
  when a change regresses them.
- **F2. Replay cases from `dev 6`** in the gitignored overlay — MJ
  documents never enter the public corpus or CI.
- **F3. Every item above names its metric.** A1/A2 → tokens per step.
  B1–B5 → lines deleted and gates removed. C → steps per fill turn.
  D → case pass + cover-page rate. E → aborted turns, false "complete".

## 10. Sequencing

**Stage 1 — measure and subtract (no new behavior).**
F1 harness, A3 cache verification, B1 dead-code deletion, B2/B3
consolidation skeletons, A1 in-turn compaction. Expected: large cost drop,
smaller diff to reason about afterward.

**Stage 2 — the expensive path.** C1–C3 placeholder fill (retires the
escalation branch), E1–E3, A4/A5 prompt and schema diet.

**Stage 3 — ranking and retirements.** D1–D3, then B4/B5 deletions that
D2 makes possible.

Stage 1 must land before Stage 3: without F1 we cannot tell whether a
ranking change paid for itself.

## 11. Definition of done

| Metric | Now | Target |
|---|---|---|
| Median input tokens / step | 167k | < 60k |
| Worst-turn input tokens / step | 475k | < 120k |
| Cost / turn (median) | ~$0.60 | < $0.20 |
| Steps on a placeholder-fill turn | 8–20 | ≤ 4 |
| `src/lib/ai/chat` non-test lines | 16,998 | ≤ 14,000 |
| `prepareStep` gates | 7 | 1 |
| Turn classifiers | 5 | 1 |
| Turns lost to the 270s abort | 2 / 35 | 0 |

## 12. Locked non-goals

- No new classifier, regex, or scorer without a retirement **and** a case.
- No prompt paragraph that restates a guard the server already enforces.
- Everything in `retrieval.md` § *Locked non-goals* still applies: no cap
  raises, no cross-report search, no force-reindex, no cross-encoder, no
  Recall@5 trend as a merge gate.
- Not a rewrite. Each item is independently shippable and independently
  reversible.
