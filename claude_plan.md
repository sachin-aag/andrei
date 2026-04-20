# Plan to Implement

## Quality Engineering Investigation Report Tool

### Context
Quality engineers at M.J. Biopharm Private Limited currently fill out DOCX investigation reports manually, then iterate over email with managers for feedback. This tool digitizes the entire workflow: engineers fill out the report in-browser with real-time auto-save, an AI evaluates whether pharmaceutical quality criteria are met using a traffic light system, managers give inline feedback, and the final report exports to a DOCX matching the exact original template format.

---

### Tech Stack
- Next.js 16 (App Router, Server Components, Server Actions)
- Neon Postgres via Vercel Marketplace + Drizzle ORM
- AI SDK v6 with Vercel AI Gateway (Gemini model) for criteria evaluation
- shadcn/ui + Tailwind CSS (dark theme, MJ Biopharm navy branding `#2D2A6E`)
- `docx` npm package for Word export
- Mock auth: hardcoded users (engineer + manager), simple login selector, no real auth system

---

### Database Schema (Drizzle ORM)

#### `users` (mock only; no DB table needed)
Hardcoded in `src/lib/auth/mock-users.ts`:

```ts
export const MOCK_USERS = [
  {
    id: '1',
    name: 'Bhargav Patel',
    email: 'bhargav@mjbiopharm.com',
    employeeId: '598',
    role: 'engineer',
  },
  {
    id: '2',
    name: 'Rajesh Kumar',
    email: 'rajesh@mjbiopharm.com',
    employeeId: '201',
    role: 'manager',
  },
] as const;
```

Login page: simple dropdown to pick a user, stored in cookie/localStorage.

#### `reports`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text PK` | `cuid` |
| `deviationNo` | `text` | e.g. `"DEV/PK/25/002"` |
| `date` | `timestamp` |  |
| `toolsUsed` | `json` | `{ sixM, fiveWhy, brainstorming }` |
| `otherTools` | `text` |  |
| `status` | `enum(draft, submitted, in_review, feedback, approved)` |  |
| `authorId` | `text FK -> users` |  |
| `assignedManagerId` | `text FK -> users` |  |
| `createdAt`, `updatedAt` | `timestamp` |  |

#### `report_sections`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text PK` |  |
| `reportId` | `FK -> reports` | cascade delete |
| `section` | `enum(define, measure, analyze, improve, control, documents_reviewed, attachments)` |  |
| `content` | `json` | Section-specific structure (see types below) |
| `updatedAt` | `timestamp` |  |
| `unique` | `(reportId, section)` |  |

#### `criteria_evaluations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text PK` |  |
| `reportId` | `FK -> reports` |  |
| `sectionId` | `FK -> report_sections` |  |
| `criterionKey` | `text` | e.g. `"define.what_happened"` |
| `criterionLabel` | `text` | Human-readable |
| `status` | `enum(met, partially_met, not_met, not_evaluated)` | Traffic light mapping |
| `reasoning` | `text` | AI explanation |
| `suggestedFix` | `text` | AI-generated fix |
| `fixApplied` | `boolean` |  |
| `bypassed` | `boolean` | User clicked Ignore / `X` |

#### `comments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text PK` |  |
| `reportId` | `FK -> reports` |  |
| `sectionId` | `FK -> report_sections` |  |
| `authorId` | `FK -> users` | Manager who commented |
| `content` | `text` |  |
| `anchorText` | `text` | Text selection |
| `status` | `enum(open, resolved)` |  |
| `createdAt` | `timestamp` |  |

---

### Section Content Types

```ts
type DefineSection = {
  narrative: string;
};

type MeasureSection = {
  narrative: string;
};

type AnalyzeSection = {
  sixM: {
    man: string;
    machine: string;
    measurement: string;
    material: string;
    method: string;
    milieu: string;
    conclusion: string;
  };
  fiveWhy: {
    whys: Array<{
      question: string;
      answer: string;
    }>;
    conclusion: string;
  };
  brainstorming: string;
  otherTools: string;
  investigationOutcome: string;
  rootCause: {
    narrative: string;
    primaryLevel1: string;
    secondaryLevel2: string;
    thirdLevel3: string;
  };
  impactAssessment: {
    system: string;
    document: string;
    product: string;
    equipment: string;
    patientSafety: string;
  };
};

type ImproveSection = {
  narrative: string;
  correctiveActions: Array<{
    id: string;
    description: string;
    responsiblePerson: string;
    dueDate: string;
    expectedOutcome: string;
    effectivenessVerification: string;
  }>;
};

type ControlSection = {
  narrative: string;
  preventiveActions: unknown[];
  interimPlan: string;
  finalComments: string;
  regulatoryImpact: string;
  productQuality: string;
  validation: string;
  stability: string;
  marketClinical: string;
  lotDisposition: string;
  conclusion: string;
};
```

---

### Criteria (Traffic Light System)

#### Define (6 criteria)
1. Clearly define what happens actually
2. Explain what is different than expected
3. Mention the location where deviation occurred
4. Date/time of occurrence and detection
5. Personnel involved
6. Initial scope (impacted product/Material/Equipment/System/Batches)

#### Measure (5 criteria)
1. Relevant facts and data reviewed (environment, process history, personnel, control limits)
2. Summary of analysis of factors and data
3. Conclusion statement of analysis
4. Regulatory notification details (if applicable)
5. Logical flow and readability

#### Analyze
No criteria, but completeness check (all sub-sections filled).

#### Improve / Corrective Action (6 criteria)
1. Specific corrective actions identified including immediate actions
2. Corrective actions for each root cause
3. Assigned unique number, responsible person, due date
4. Expected outcome described and verifiable
5. Effectiveness verification documented
6. Actions achievable

#### Control / Preventive Action (14 criteria)
1. Preventive actions for each root cause
2. Linked to root cause classification
3. Assigned unique number, responsible person, due date
4. Expected outcome verifiable
5. Effectiveness verification documented
6. Interim plan addressed
7. Rationale when no preventive action
8. Final comments support conclusion
9. Impact assessment fields complete (Regulatory, Product Quality, Validation, Stability, Market/Clinical)
10. Lot disposition matches conclusions
11. Conclusion includes final decision + rationale
12. CAPA verified complete
13. Summary of root cause + final scope/impact
14. Preventive actions achievable

Traffic light colors:
- Green = met
- Yellow = partially met
- Red = not met
- Grey/Black = not yet evaluated (section blank)

Section-level light:
- Green if all criteria are green
- Yellow if any are yellow and none are red
- Red if any are red

---

### Key Features

#### 1. Auto-Save (debounced 1.5s)
- `useAutoSave` hook tracks dirty state and debounces `PATCH` to `/api/reports/[id]/sections/[type]`
- Status indicator in header: `"Saved"` / `"Saving..."` / `"Error"`
- Flush on page unload via `navigator.sendBeacon`

#### 2. AI Evaluation
- Trigger: manual `"Run AI Check"` button (not auto; too expensive)
- API: `POST /api/reports/[id]/evaluate` using `generateText + Output.object()` via AI Gateway with Gemini
- Prompt: section content + criteria list -> returns `{ evaluations: [{ criterionKey, status, reasoning, suggestedFix }] }`
- Results stored in `criteria_evaluations` table and displayed in sidebar

#### 3. Suggested Fixes
- Displayed in sidebar under each yellow/red criterion
- Apply: appends fix text to section content, highlights in green (`bg-green-900/30`), marks `fixApplied = true`
- Ignore (`X`): marks `bypassed = true`, criterion shows as overridden (grey with strikethrough)

#### 4. Manager Feedback Workflow
- Submit: engineer clicks `"Submit for Review"` -> `status = submitted`
- Review: manager sees report read-only and can add inline comments (`select text -> add comment`)
- Feedback: manager clicks `"Return with Feedback"` -> `status = feedback`, engineer sees comments
- Approve: manager clicks `"Approve"` -> `status = approved`, export available
- Comments displayed as highlighted anchors in editor and listed in sidebar

#### 5. DOCX Export
- `GET /api/reports/[id]/export` generates DOCX using the `docx` npm package
- Matches exact format: header with logo + company name + SOP reference, footer with confidentiality + page numbers, main content in single large table, signature table at bottom
- Available at any time (draft or approved)

---

### File Structure

```text
src/
  app/
    layout.tsx                              -- Dark theme, font, session provider
    page.tsx                                -- Dashboard: reports list + create
    globals.css                             -- Tailwind + shadcn theme (navy brand)
    login/page.tsx                          -- Mock login: pick user from dropdown
    reports/
      [reportId]/
        layout.tsx                          -- ReportProvider context
        page.tsx                            -- Redirect to /edit or /review
        edit/page.tsx                       -- Main editor (engineer)
        review/page.tsx                     -- Review view (manager)
    api/
      auth/login/route.ts                   -- POST mock login (set cookie)
      reports/
        route.ts                            -- GET list, POST create
        [reportId]/
          route.ts                          -- GET, PATCH header fields
          sections/[sectionType]/route.ts   -- PATCH auto-save
          evaluate/route.ts                 -- POST AI evaluation
          comments/route.ts                 -- GET, POST
          comments/[commentId]/route.ts     -- PATCH resolve
          submit/route.ts                   -- POST
          approve/route.ts                  -- POST
          feedback/route.ts                 -- POST
          export/route.ts                   -- GET DOCX download

  components/
    ui/                                     -- shadcn components
    layout/
      app-sidebar.tsx                       -- Left nav with MJ logo
      header.tsx                            -- Save status, user, export button
    report/
      report-header.tsx                     -- Date, Deviation No, tools checkboxes
      section-tabs.tsx                      -- Define | Measure | Analyze | Improve | Control tabs
      section-editor.tsx                    -- Dispatches to section-specific editors
      sections/
        define-editor.tsx
        measure-editor.tsx
        analyze-editor.tsx                  -- Sub-sections: 6M, 5-Why, brainstorming, etc.
        improve-editor.tsx                  -- Narrative + corrective actions table
        control-editor.tsx                  -- Narrative + preventive actions + impact fields
      traffic-light-sidebar.tsx             -- Right panel with criteria status
      criterion-row.tsx                     -- Single criterion: dot + label + expand
      suggested-fix-card.tsx                -- Fix text + Apply/Ignore buttons
      comment-thread.tsx                    -- Manager comments list
      save-status.tsx                       -- Saved/Saving indicator

  db/
    index.ts                                -- Drizzle + Neon serverless driver
    schema/                                 -- All table definitions
    migrations/                             -- Generated migrations

  lib/
    ai/
      evaluate.ts                           -- AI evaluation with Gemini via Gateway
      criteria.ts                           -- Static criteria definitions
    export/
      generate-docx.ts                      -- DOCX generation matching template

  hooks/
    use-auto-save.ts                        -- Debounced save hook
    use-report.ts                           -- Report context hook

  types/
    sections.ts                             -- Section content types
    report.ts                               -- Report, evaluation types

  providers/
    report-provider.tsx                     -- React context

public/
  logo.png                                  -- MJ Biopharm logo (already extracted)
```

---

### UI Layout

```text
+--[Left Nav]--+----[Main Editor (70%)]-------------+--[Right Sidebar (30%)]--+
| MJ Logo      | [Report Header: Date, Dev#, Tools] | [Traffic Light Panel]   |
| Dashboard    | [Define|Measure|Analyze|Improve|Ctrl] [Section: Define]      |
| Reports      |                                     |   o Criterion 1 (green) |
|              | [Section Editor Area]               |   o Criterion 2 (red)   |
|              | [Textarea with auto-save]           |     > Suggested fix     |
|              | [+ criteria checklist banner]       |     [Apply] [X]         |
|              |                                     |   o Criterion 3 (yellow)|
|              |                                     | [Section: Measure]      |
|              |                                     |   ...                   |
|              |                                     | [Run AI Check] button   |
|              | [Save status: Saved]                | [Submit for Review]     |
+---[Export DOCX button in header]------------------+-------------------------+
```

---

### Implementation Order
1. Project setup: initialize Next.js 16, shadcn/ui, Tailwind (dark/navy theme), Drizzle, and Neon connection
2. Database: schema + migrations
3. Auth: mock login page (user picker dropdown, cookie-based)
4. Dashboard + report CRUD: list, create, basic routing
5. Section editors: all 5 DMAIC sections with proper sub-fields for Analyze
6. Auto-save: `useAutoSave` hook + section `PATCH` endpoints
7. AI evaluation: criteria definitions, Gemini evaluation endpoint, traffic light sidebar
8. Suggested fixes: Apply/Ignore flow with green highlights
9. Manager workflow: submit, review, comments, approve/feedback
10. DOCX export: full template-matching export
11. Polish: loading states, error handling, responsive layout

---

### Verification
1. Create a report, fill all sections, and verify auto-save persists on page reload
2. Run AI Check and verify traffic lights update and suggested fixes appear
3. Apply a fix and verify inline green highlight and criterion turns green
4. Submit to manager and verify manager sees report and can add comments
5. Return with feedback and verify engineer sees comments
6. Approve and verify status is locked
7. Export DOCX, open it in Word, and compare side-by-side with the original template
8. Run `npx tsc --noEmit` to verify there are no type errors