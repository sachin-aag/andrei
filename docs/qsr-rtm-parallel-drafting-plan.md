# QSR RTM Tables 5–10: two-phase drafting plumbing

Living plan. Status: implemented on `cursor/qsr-references-search-f517`
(PR #455). Scope is QSR (`qualification_summary_report`) Tables 5–10 —
`qsr_rtm_process`, `qsr_rtm_control`, `qsr_rtm_gmp`, `qsr_rtm_safety`,
`qsr_rtm_csv`, `qsr_rtm_maintenance`.

Identity-first + one card stays. Nested Flash-Lite family jobs (90s,
`submit_family_cells`) are not the destination for DQ / IQ / OQ / PQ.
The later PR ports this mini orchestrator onto the general DAG and uses
Tables 5–10 as the first recipe and the test — see
`docs/dag-orchestrator.md`. Do not reopen PR #413.

## 1. The failure we are fixing

Ask Agent to "draft table 5" and it drafts a subset of the URS rows. Ask in the
next message "which other URSes should be added" and it lists every remaining
ID correctly. The information was available on the first turn; the plumbing
threw it away.

Langfuse evidence:

| Trace | What happened |
|-------|---------------|
| `2bc3de972b84b69d` (prod) | One `insert_rows` carried URS-2…12 **plus** invented DQ/IQ cover-page citations. Grounding returned `unsupported_facts` for the whole batch. The retry inserted 7 rows (URS-2, 3, 5, 6, 7, 11, 12) and the model wrapped up. |
| `70c2f532c0925440` (preview) | Same first bounce. The retry inserted URS-13…20 with `NA`. The server replied `missingUrsIds: [URS-2…12, 21…29, 33]` and `keepSearchOpen: true`; the model still wrapped up. |
| `2a9c1abd7f345579` (follow-up) | "any other URSes we should add?" → one `read_section`, then a complete prose list. Read-only chat has no table grounding gate, so nothing filtered it. |

Three distinct causes, in order of how much they cost us:

1. **Identity and family columns share one grounding unit.** URS ID /
   Parameters / User requirements (identity, cheap and already on reviewed
   pages) travel in the same `insert_rows` as Reference – DQ / IQ / OQ / PQ
   (expensive, needs a protocol grep per family). One ungrounded family cell
   blocks the batch, so the identity rows die with the guess.
2. **The retry narrows instead of completing.** After a block the model
   re-proposes a smaller batch. `missingReviewedUrsIds` already computes the
   gap and `keepSearchOpen` already asks for another round, but nothing
   *prevents* wrap-up, so the turn ends on a partial table.
3. **Family columns are serial work on the orchestrator.** Four protocol
   families, one grep loop each, on the turn's main model, inside a 270s abort.
   The model gives up on the remaining families (NA) or on the remaining rows.

## 2. Target behaviour

One turn, for an empty or partial RTM table:

1. Every URS ID the reviewed URS pages list for *this* table lands as a row,
   with Parameters and User requirements copied from those pages.
2. The four protocol families are filled by four workers running in parallel,
   each grepping only its own family (DQ / IQ / OQ / PQ).
3. The engineer sees **one** suggestion card for the table.
4. A family cell that cannot be grounded is left empty — it never blocks the
   URS row.
5. The turn cannot wrap up while reviewed URS IDs are still missing.

## 3. What today's plumbing cannot do

### 3.1 Document chat has no write-side worker pool

Analytics has the pattern: `extract_sheet` →
`src/lib/statistical-analysis/extract-sheet.ts` → `withSheetExtractSlot`
(`EXTRACT_SHEET_CONCURRENCY = 4`) → `runSheetExtractJob` spawning a child
`generateText` whose tool set was built with `role: "sheet_worker"`, writing
under `withWorksheetMutationLock`.

Document chat's only pool is `continue_document_review`
(`REVIEW_EXTRACT_CONCURRENCY = 8` in `src/lib/ai/chat/document-review.ts`), and
it only *reads* OCR pages. `edit_table` and `draft_field` run on the
orchestrator with no sub-agent and no section lock.

### 3.2 `edit_table` proposes, it does not commit

`loadMergedSection` (`src/lib/ai/chat/tools.ts`) reads persisted
`report_sections.content`; a successful `edit_table` inserts an `ai_fix`
comment carrying a frozen `tableOperation` and leaves the section untouched.

Consequence: a naive phase split cannot work. If phase 1 proposes
`insert_rows` for URS-2…33 as a card, phase 2's `edit_cells` for the DQ column
re-reads the section, does not find those rows, and fails `row_not_found`.
Four parallel `edit_table` calls would each build a card against the same
pre-edit document and then partially cancel each other through
`dismissSuggestionsSupersededBy`.

So the split has to happen **below** the card: compose one operation, create one
card.

### 3.3 Grounding is per-operation, with a second-chance rescue

`groundTableOperation` grounds every cell of one operation and returns
`blocked: true` for the operation. `clearOptionalOnBlock` already empties
unsupported RTM family / Remarks cells (`isQsrRtmOptionalReferenceColumn`), but
`edit_table` only re-runs with that flag *after* a block, as a rescue. We want
the split to be structural: identity cells and family cells are grounded as
separate units, so identity landing is not contingent on a rescue pass.

## 4. Architecture

New dispatcher tool `draft_rtm_table`, advertised only when the document type is
`qualification_summary_report` and the in-scope section is an RTM table.
Implementation in a new module; `tools.ts` only wires it.

```
draft_rtm_table (orchestrator tool, one card)
├── A  plan        no LLM: checklist = reviewed URS IDs − rows already live
├── B  identity    1 worker  → URS ID / Parameters / User requirements
├── C  families    4 workers in parallel → DQ, IQ, OQ, PQ cells
├── D  compose     insert_rows + edit_cells → one grounding pass → one card
└── E  report      rowsProposed, per-family coverage, missingUrsIds
```

### Stage A — plan (no model call)

```ts
// src/lib/ai/chat/rtm-draft-plan.ts
export function planRtmDraft(input: {
  section: QsrRtmSection;
  ledger: CitationPageLedger;
  fieldDoc: JSONContent | null;
}): {
  liveRowKeys: string[];      // liveTableRowContextByKey(fieldDoc)
  missingUrsIds: string[];    // ursIdsForRtmSection(urs quotes, section) − live
  ursPages: { filename: string; pageNumber: number; quote: string }[];
};
```

Reuses `ursIdsForRtmSection`, `isUrsFilename`, `liveTableRowContextByKey` from
`qsr-row-grounding.ts`. The checklist is derived **only** from reviewed URS page
quotes, never from protocol pages — that is what keeps IDs in the right table
(the heading slice in `ursIdsForRtmSection` already assigns URS-34a/b to 5.2).

If `missingUrsIds` is empty and no family column is blank, the dispatcher
returns `status: "nothing_to_do"` and the model falls back to `edit_table`.

### Stage B — identity worker

One job, because the facts are already on the ledger: the reviewed URS
transcripts are seeded by `finish_document_review`'s `reviewedEvidence`. The
worker gets those transcripts in its system prompt plus read-only retrieval
tools (`read_document_page`, `search_documents`, `document_outline`) for pages
the digest truncated.

```ts
// src/lib/ai/chat/rtm-identity-job.ts
export async function runRtmIdentityJob(input: RtmIdentityJobInput): Promise<{
  status: "ok" | "partial" | "error";
  rows: Array<{
    ursId: string;
    parameters: string;
    userRequirement: string;
    citation: string;          // "[URS.pdf, p. 4]"
  }>;
  notFound: string[];          // IDs on the checklist with no readable window
  message?: string;
}>;
```

Contract: the checklist is enumerated in the prompt and the job is not complete
until every ID is either in `rows` or in `notFound`. `analyticsSheetJobComplete`
is the precedent for a `stopWhen` that insists on a complete payload.

### Stage C — family workers (the parallel part)

Four jobs, one per `RtmStageFamily`, dispatched with `Promise.all` through a
module-level slot pool:

```ts
// src/lib/ai/chat/rtm-worker-pool.ts
export const RTM_WORKER_CONCURRENCY = 4;
export async function withRtmWorkerSlot<T>(task: () => Promise<T>): Promise<T>;

// src/lib/ai/chat/rtm-family-job.ts
export async function runRtmFamilyJob(input: {
  reportId: string;
  section: QsrRtmSection;
  family: RtmStageFamily;              // "dq" | "iq" | "oq" | "pq"
  rows: Array<{ ursId: string; parameters: string; userRequirement: string }>;
  tools: ToolSet;                      // read-only subset, shared ledger
  attachmentIds?: readonly string[];   // files whose family matches
  abortSignal?: AbortSignal;
  turnStartedAtMs?: number;
}): Promise<{
  status: "ok" | "partial" | "error";
  family: RtmStageFamily;
  cells: Array<{ ursId: string; text: string; citation: string }>;  // "" = leave blank, "NA" = searched, absent
  message?: string;
}>;
```

Each worker:

- is built on `resolveChatExtractLanguageModel()` (Flash-Lite, thinking
  `minimal`), the same model `extract_sheet` workers and page extracts use;
- greps **only** its own family's attached protocol (`documentFamilyFromFilename`
  decides which attachments it may touch), so the four workers do not duplicate
  each other's retrieval;
- shares the turn's `CitationPageLedger` instance, so every page it reads is on
  the ledger when Stage D grounds the composed operation — this is the one piece
  of shared mutable state, and it is append-only;
- emits `{section number} – {audit line}` text per the existing RTM rule
  (`rtmSectionCellText` strips page counters and logged readings). Persist
  (`resolveRtmFamilyCell`) rewrites a leftover `Section 8` / cover cite
  onto the body heading and page, or clears the cell when only a cover
  is on the ledger;
- never calls a write tool: the tool set handed to it contains only
  `search_documents`, `read_document_page`, `document_outline`.

Budget: `RTM_WORKER_BUDGET_MS = 90_000` per worker, plus the shared
`isChatTurnDeadlineReached` / `abortSignal` checks `runSheetExtractJob` already
models. A worker that runs out returns `status: "partial"` with whatever cells
it grounded.

`submit_family_cells` only stores a row when the cell is persistable
(`{section} – {audit line}` that names this row's Parameters, or NA).
Number-only `12.1` / `Section 8`, empty, and a rupture-disk heading on a
vacuum-gauge row are rejected and `remaining` stays open, so Flash-Lite
cannot finish after one chapter grep. Persist then attaches an audit
line to leftover number-only cells only when that same section number
is on the ledger (keep `8.1` / `12.1` if pick is null; do not swap
`12.1` onto `12.4`; do not fill empty leftovers).

### Stage D — compose once, ground once, one card

```ts
// src/lib/ai/chat/rtm-compose.ts
export function composeRtmOperations(input: {
  section: QsrRtmSection;
  fieldDoc: JSONContent | null;
  identityRows: RtmIdentityRow[];
  familyCells: RtmFamilyCells[];
}): {
  insertRows: TableOperation | null;   // new URS IDs, identity + family columns
  editCells: TableOperation | null;    // family columns of rows already live
};
```

Then, inside the dispatcher:

1. Ground the **identity unit** first (`insert_rows` with family columns held
   back) — `groundTableOperation` with the live grounding mode. If this blocks,
   the whole dispatcher returns `unsupported_facts`; identity is the one thing
   we refuse to fake.
2. Merge the family cells into the grounded identity operation and re-ground
   with `clearOptionalOnBlock: true` from the start, so an unsupported family
   cell empties (`isQsrRtmOptionalReferenceColumn`) instead of blocking.
3. Build **one** `ai_fix` comment the same way `edit_table` does today
   (`captureTableOperationSnapshots` → `tableCellAdjustments` →
   `serializeAiFixCommentContent` → `dismissCovered`). Cleared family cells show
   up in `adjustedCells` so the wrap-up quotes `adjustedCells.saved`, per the
   existing rule.

If both an `insert_rows` and an `edit_cells` are needed (some URS rows already
live, some new), compose them as two operations on one card only if the card
format allows it; otherwise run them as two sequential cards *within the
dispatcher* and return both ids. Decide while building Stage D — `edit_table`'s
payload holds a single `tableOperation`, so the likely answer is: apply
`edit_cells` for live rows first (card 1), then `insert_rows` (card 2), and
return `suggestionIds: string[]`. The UI already renders multiple table cards;
what we must not do is let four *family* calls each make a card.

### Stage E — result contract

```ts
{
  status: "proposed" | "partial" | "nothing_to_do" | "unsupported_facts" | "review_incomplete" | "stub",
  suggestionIds: string[],
  section, targetField,
  rowsProposed: number,
  familyCoverage: { dq: number; iq: number; oq: number; pq: number },
  clearedCells: number,
  missingUrsIds: string[],
  keepSearchOpen?: true,
  proposalNote: string,
}
```

`missingUrsIds` keeps `missingReviewedUrsIds` as its source of truth so the
existing message (`missingUrsIdsMessage`) and the existing tests still apply.

## 5. Serialization

- **Worker fan-out:** `withRtmWorkerSlot`, concurrency 4, same shape as
  `withSheetExtractSlot`.
- **Dispatcher:** one at a time per report+section, through a tail promise keyed
  `${reportId}\0${section}` — the shape `enqueueProposeEdit` /
  `enqueueInsertImage` already use in `buildChatTools`. Two `draft_rtm_table`
  calls in one turn therefore compose serially against a fresh
  `loadMergedSection`, and the second sees the first's card via `dismissCovered`
  rather than racing it.
- **No DB lock needed:** the dispatcher writes comments, not section content, so
  there is no analogue of `withWorksheetMutationLock` to add.

## 6. Tool availability and step policy

- Register `draft_rtm_table` in `DOCUMENT_WRITE_TOOLS`
  (`src/lib/ai/chat/user-intent.ts`) so intent gating hides/unlocks it with the
  other write tools.
- Add it to `PLAN_MODE_CHAT_TOOL_NAMES`
  (`src/lib/ai/chat/document-review.ts`) — a tool missing from that allowlist is
  silently absent in Plan.
- `src/lib/ai/chat/step-policy.ts`:
  - when the in-scope section is an RTM table and the turn is a write, force
    `draft_rtm_table` over `edit_table` for the first write step (empty or
    partial table); keep `edit_table` available afterwards for single-cell
    corrections;
  - new `rtmDraftLoopDirective(steps)`: if the latest `draft_rtm_table` returned
    a non-empty `missingUrsIds`, do not allow finish — re-offer
    `draft_rtm_table` with the remaining checklist. Cap at two continuations so
    a permanently unreadable page cannot loop the turn;
  - `searchLoopDirective` already keeps grep open on `keepSearchOpen`; no change.
- `repairChatToolCall` needs no change (`unsupported_tool` already catches a
  hallucinated name and unlocks registered write tools on the next step).

## 7. Prompts

- Bump `CHAT_PROMPT_VERSION`.
- `src/lib/document-types/qsr/drafting-guidance.ts`: Tables 5–10 are drafted
  with `draft_rtm_table` — one call fills the URS rows and dispatches the four
  protocol families; do not hand-fill family columns with `edit_table`, and do
  not paste a markdown RTM.
- Wrap-up rule: report `rowsProposed`, `familyCoverage`, and
  `adjustedCells.saved` for cleared cells. Never claim a family column landed
  when the dispatcher cleared it.

## 8. Deadline, cancel, stub

- Dispatcher checks `isChatTurnDeadlineReached` before starting Stage C and
  returns `status: "partial"` (identity landed, families outstanding,
  `keepSearchOpen: true`) rather than losing the turn.
- A 270s abort still captures `ai_chat_failed` with `site: deadline_abort`; the
  copy must not tell the engineer to re-prompt.
- `isTestStubChat()` → `status: "stub"`, no card, like `runSheetExtractJob`.

## 9. Observability

- Langfuse: dispatcher `functionId: "report-rtm-draft"`, workers
  `report-rtm-identity` / `report-rtm-family`, metadata `{ section, family,
  checklistSize, rowsProposed }`.
- `recordAiUsage({ feature: "report_chat", modelId: CHAT_EXTRACT_GOOGLE_MODEL_ID })`
  per worker, so the fan-out is visible in cost.
- Audit stays `claim_verified` / `claim_unsupported` on the composed card.

## 10. Tests

New:

- `src/lib/ai/chat/rtm-draft-plan.test.ts` — checklist = reviewed IDs − live
  rows; heading slice keeps 5.2 IDs out of 5.1; no IDs sourced from protocol
  pages.
- `src/lib/ai/chat/rtm-compose.test.ts` — new IDs → `insert_rows`, live IDs →
  `edit_cells`; an unsupported family cell empties and the URS row survives; an
  unsupported identity cell blocks.
- `src/lib/ai/chat/rtm-worker-pool.test.ts` — concurrency cap; dispatcher
  serialization per section.

Extended:

- `src/lib/ai/chat/qsr-rtm-draft-replay.test.ts` — replay the two Langfuse
  batches through `buildChatTools`: URS-2…12 must land even though the DQ/IQ
  citations are ungrounded.
- `src/lib/ai/chat/step-policy.test.ts` — no finish while `missingUrsIds` is
  non-empty; `draft_rtm_table` forced on an empty RTM table; present in the Plan
  allowlist.
- `scripts/eval/chat-draft-cases.json` + `pnpm chat-eval -- --replay` — a
  "draft table 5" case whose floor is *every* reviewed URS ID.

E2E is unchanged: stub chat cannot assert tool selection.

## 11. Docs to update with the code

`AGENTS.md` (hard rules + chat/attachments summary), `CLAUDE.md` (suggestions /
chat subsystem), `.cursor/rules/chat-and-attachments.mdc`,
`.claude/skills/chat-subsystem/SKILL.md`, and this file.

## 12. Commit sequence on `cursor/qsr-references-search-f517`

One branch, one PR (#455). Each step is a commit that keeps `pnpm precommit`
green:

1. this plan;
2. `rtm-worker-pool.ts` + `rtm-draft-plan.ts` + unit tests (no tool yet);
3. `rtm-identity-job.ts` + `rtm-family-job.ts` (workers, read-only tool subset);
4. `rtm-compose.ts` + grounding split + unit tests;
5. `draft_rtm_table` wiring in `tools.ts`, `user-intent.ts`,
   `document-review.ts` allowlist, `step-policy.ts`, `CHAT_PROMPT_VERSION`;
6. replay + chat-eval cases;
7. docs.

## 13. Risks

- **Turn budget.** Identity worker plus four family greps inside 270s. Mitigated
  by: identity reads reviewed transcripts instead of re-grepping, families run in
  parallel with one family's attachments each, and `partial` is a first-class
  result instead of a failure.
- **Two write paths for one table.** `edit_table` stays for corrections, which
  means the model can still choose the old, worse path. Mitigated by the forced
  first write step and by the tool description.
- **Card count.** Live rows + new rows may need two cards. Acceptable; four
  family cards are not.
- **Over-insertion into the wrong table.** The checklist comes only from the URS
  heading slice; no protocol page may add an ID.
- **Worker drift on family text.** Workers must obey `rtmSectionCellText`
  (dotted section numbers, no page counters, no logged readings). The composed
  operation runs through the same grounding as today, so drift empties the cell
  rather than persisting it.

## 14. Open questions

- One identity worker for the whole table, or one per URS page? Start with one;
  split if a 12-page URS blows the budget.
- Do family workers also own `Remarks`, or does the dispatcher derive Remarks
  (`NA` at row level) from the four family results? Current lean: dispatcher
  derives it, because the row-level N/A rule needs all four families.
- Should the dispatcher also run for Table 5–10 *corrections* (a single family
  column for one row), or is that `edit_table` forever? Current lean:
  `edit_table`.
