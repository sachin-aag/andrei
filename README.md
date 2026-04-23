# M.J. Biopharm · Investigation Report Tool

A Next.js 16 application that replaces the manual DOCX-over-email workflow for deviation investigation reports (per SOP/DP/QA/008) with an in-browser DMAIC editor featuring:

- **Auto-save** every 1.5s with status indicator and `sendBeacon` flush on unload.
- **AI traffic-light** evaluation against pharmaceutical quality criteria (Gemini via the Vercel AI Gateway).
- **Suggested fixes** with `Apply` (appends fix in a highlighted block) and `Ignore` (bypass).
- **Manager review workflow**: engineer submits → manager comments, then approves or returns feedback.
- **DOCX export** matching the original template (company header, SOP reference, main content, signature block, and footer with page numbers).

---

## Tech stack

- Next.js 16 (App Router, Server Components, Route Handlers, Turbopack)
- React 19
- TypeScript (strict)
- Tailwind CSS v4 (dark theme, MJ Biopharm navy brand `#2D2A6E`)
- Drizzle ORM with Neon Postgres (serverless)
- AI SDK v6 (`ai` + `@ai-sdk/gateway` + `@ai-sdk/google`) using Gemini via the Vercel AI Gateway
- `docx` for DOCX generation
- Radix UI primitives (custom shadcn-style components)
- `sonner` for toasts

## Prerequisites

- Node.js 20+
- A Neon Postgres database (via the Vercel Marketplace) or any Postgres URL
- A Vercel AI Gateway API key (optional; AI evaluation is gated on it)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local:
#   DATABASE_URL=postgres://...         # Neon connection string
#   AI_GATEWAY_API_KEY=...              # Vercel AI Gateway key

# 3. Create the database schema
npm run db:push            # or: npm run db:generate && npm run db:migrate
#    See docs/database-schema.md for full table reference and disaster recovery.
#    If you see Postgres "column ... does not exist" on comments: npm run db:fix-comments

# 4. Run the dev server
npm run dev
# → http://localhost:3000
```

On first load you'll be redirected to `/login`. Pick any mock user:

| Name           | Role     | Employee ID |
| -------------- | -------- | ----------- |
| Bhargav Patel  | Engineer | 598         |
| Priya Sharma   | Engineer | 312         |
| Rajesh Kumar   | Manager  | 201         |
| Anil Deshmukh  | Manager  | 105         |

Edit `src/lib/auth/mock-users.ts` to change the list.

## Workflow

1. **Engineer** (Bhargav) logs in → Dashboard → `New Report` → fill deviation number and assigned manager.
2. Redirected to the editor. The five DMAIC tabs (Define, Measure, Analyze, Improve, Control) auto-save on every keystroke with a 1.5s debounce.
3. Click **Run AI Check**: Gemini evaluates each criterion and populates the right-hand traffic-light panel.
4. For yellow/red criteria, click **Apply** to paste the suggested fix into the section (highlighted block) or **Ignore** to override.
5. Click **Submit for Review**. Report status transitions to `submitted`.
6. **Manager** (Rajesh) sees the report in their Queue on the dashboard → clicks it → sees the read-only review.
7. Manager adds comments from the right-hand `Comments` tab. Status transitions to `in_review` on the first comment.
8. Manager clicks **Return with Feedback** (→ `feedback`, engineer can edit again) or **Approve** (→ `approved`).
9. At any time, anyone can click **Export DOCX** in the header to download a Word document matching `SOP/DP/QA/008/F04-R02`.

## Project structure

```
src/
  app/                         Next.js App Router
    layout.tsx                 Dark theme + toaster
    page.tsx                   Dashboard
    login/                     Mock user picker
    reports/[reportId]/        Editor + review routes
    api/                       Route handlers
      auth/(login|logout)
      reports/                 GET list / POST create
        [reportId]/            GET / PATCH header
          sections/[sectionType]/  Auto-save section content
          evaluate/            AI traffic-light evaluation
          evaluations/[id]/    Apply / Ignore fix
          comments/            Post / list comments
          submit/ approve/ feedback/
          export/              DOCX download
  components/
    layout/app-shell.tsx       Left nav with MJ logo + user
    ui/                        shadcn-style primitives
    report/
      report-workspace.tsx     Header bar + tabs + sidebar
      report-header.tsx        Deviation no, date, tools checkboxes
      sections/                Per-section editors (define, measure, analyze, improve, control)
      traffic-light-sidebar.tsx
      comments-panel.tsx
      status-badge.tsx
      save-status.tsx
  db/
    index.ts                   Drizzle + Neon driver
    schema/                    Tables + enums + relations
    migrations/                Drizzle-generated SQL
  hooks/
    use-auto-save.ts           Debounced save, beacon flush
    use-section-save.ts        Section-specific auto-save
  lib/
    ai/
      criteria.ts              Static criteria definitions
      evaluate.ts              generateObject() with Gemini
    auth/
      mock-users.ts
      session.ts
    export/
      generate-docx.ts         Template-matching DOCX
    utils.ts
  providers/
    report-provider.tsx        Centralised client state
  types/
    sections.ts                Section content types + EMPTY_CONTENT
    report.ts                  DB row types for client
public/
  logo.png                     MJ Biopharm logo
reference-template.docx        Original DOCX (for comparison)
```

## Data model

- `reports` — header fields, status (`draft | submitted | in_review | feedback | approved`), author, assigned manager.
- `report_sections` — one row per DMAIC section, `content` JSONB typed in `SectionContentMap`.
- `criteria_evaluations` — AI-produced traffic-light result per criterion, plus `fixApplied` / `bypassed` flags.
- `comments` — manager comments, optionally anchored to a section.

All section-level criteria are defined statically in `src/lib/ai/criteria.ts` (Define = 6, Measure = 5, Analyze = 5 completeness, Improve = 6, Control = 14).

## AI evaluation

The `/api/reports/[reportId]/evaluate` route calls `generateObject` with a zod schema:

```ts
{
  evaluations: [
    {
      criterionKey,
      status: "met" | "partially_met" | "not_met",
      reasoning,
      suggestedFix: { anchorText, replacementText }
    }
  ]
}
```

The prompt includes the deviation number, date, section content, and the ordered list of criteria. The Gemini model `google/gemini-2.5-flash` is routed through the Vercel AI Gateway (set `AI_GATEWAY_API_KEY`).

Results are upserted into `criteria_evaluations`. When a criterion becomes `met` on re-evaluation, prior `fixApplied` stays true; any `bypassed` flag is cleared.

## DOCX export

`src/lib/export/generate-docx.ts` produces a document that mirrors `reference-template.docx`:

- Header with logo + full company address + "Investigation Report" + `Ref. SOP No.: SOP/DP/QA/008`
- Top 2×2 table with Date, Deviation No., Investigation tools (`☑` / `☐`), Other Tools
- DMAIC sections with checklist guidance, 6M labels, 5-Why pairs, root cause levels, impact assessment
- CAPA registers (`CA-001`, `PA-001`, …) with responsible person / due date / expected outcome / effectiveness
- Signature table: Prepared By / Reviewed By (×2) / Approved By QA
- Footer: `Confidential and Proprietary` · `Page X of Y` · `SOP/DP/QA/008/F04-R02`

## Scripts

```bash
npm run dev            # start dev server
npm run build          # production build
npm run start          # run built app
npm run lint
npm run typecheck      # tsc --noEmit
npm run db:generate    # drizzle-kit generate
npm run db:push        # drizzle-kit push (applies schema directly)
npm run db:migrate     # drizzle-kit migrate
npm run db:studio      # drizzle studio GUI
```

## Verification checklist

1. Create a report, fill all sections, reload - changes persist (auto-save).
2. Run AI Check - traffic lights update; yellow/red criteria show suggested fixes.
3. Apply a fix - section narrative gains a highlighted `[AI-suggested fix applied …]` block; criterion turns green.
4. Submit report. Log in as a manager; the report is in the queue.
5. Post a comment; status becomes `In Review`.
6. Return with Feedback; log back in as the engineer, edit, resubmit.
7. Approve; status locks to `Approved`.
8. Export DOCX and compare side-by-side with `reference-template.docx`.
9. `npm run typecheck` passes.
