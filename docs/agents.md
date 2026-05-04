# Project Overview for LLM Agents

## 1.  Purpose

The **Compliance‑Advisor** project is built around a set of *agents* – small, purpose‑driven modules – that harness large language models (LLMs) to automatically assess user‑submitted text against a predefined compliance checklist.  Each agent is responsible for a single step in the evaluation pipeline:

| Agent | Responsibility | Input | Output |
|-------|----------------|-------|--------|
| *Evaluator* | Runs the LLM and parses a structured JSON response. | Section text + contextual metadata | List of `{criterionKey, status, reasoning, suggestedFix}` objects |
| *Reporter* | Formats the evaluation for the UI / API. | Evaluation objects | Human‑readable summary, markdown, or JSON API payload |
| *Fix Suggestor* | (Optional) Triggers the model to generate code‑style fix snippets for *red* criteria. | Evaluation + original source code | Suggested pull‑request changes |

## 2.  Architecture Diagram

```
+-----------------+          +--------------+          +--------------+
|  User Interface | <--UI--> |  API Gateway | <--HTTP--> |  Agent Layer |
+-----------------+          +--------------+          +--------------+
       ^                            ^                        |
       |                            |                        v
   +------------+              +------------+          +-------------+
   |  Storage   | <--DB/FS--   |  Workflow  | <--Queue--> |  LLM Runtime |
   +------------+              +------------+          +-------------+
```

* The **UI** (React/Vue/CLI) collects a document, splits it into *sections*, and sends each section to the API gateway.
* The **API Gateway** forwards the request to the *Agent Layer*, which orchestrates the LLM calls.
* The **Workflow engine** (currently a simple serial loop, but designed for future fan‑out) ensures the agents run in the correct order.
* The **LLM Runtime** talks to either Google Gemini or OpenAI’s models (selected via `resolveModel()`).

## 3.  Project Structure

```
📁 src/
├─ labs/
│  ├─ evaluator.ts          # Core evaluation logic
│  ├─ report.js              # Static checklist + helper functions
│  ├─ qa.js                  # (Optional) QA agent for quick follow‑ups
│  └─ lab.js                 # Orchestrator – pulls in criteria and agents
└─ server/
   ├─ index.js                # Express + middlewares
   ├─ agents/
   │   ├─ evaluator.ts       # Agent that calls `evaluateSection`
   │   ├─ reporter.ts        # Agent that turns results into a UI payload
   │   └─ fixer.ts           # Generates diff for *red* results
└─ docs/
   └─ agents.md               # THIS FILE
```

*All code lives under `src/` to make it test‑friendly and bundleable.  External services (LLMs, DB) are abstracted behind thin adapters.

## 4.  How LLMs Are Used

1. **Prompt engineering** – The evaluator agent uses a *system prompt* to define the role ("Compliance checker") and a *user prompt* to embed the section content and metadata.  The prompt explicitly asks the model to respond **ONLY** with JSON that matches `evaluationSchema`.
2. **Schema‑driven parsing** – `generateObject()` from the `ai` SDK validates the model output against `evaluationSchema`.  The schema guarantees that each criterion yields:
   ```json
   {
     "criterionKey": "string",
     "status": "green" | "yellow" | "red" | "not_evaluated",
     "reasoning": "string",
     "suggestedFix": "string"
   }
   ```
3. **Determinism** – A low temperature (0.2) is used for consistency.  If the model deviates from the schema, the request fails fast.
4. **Optional code‑level fixer** – The `Fix Suggestor` agent can be wired to generate pull‑request diffs when a criterion is *red*.

## 4.  End User Workflow

1. User uploads or pastes a document.
2. Document is automatically split into *sections* (e.g., by headings or paragraph chunks).
3. Each section is sent to the evaluation API.
4. The API returns a JSON array of criteria evaluations.
5. The UI presents a compliance scorecard and, for *red* items, clickable suggestions that can be merged as a PR.

## 5.  Running the Project

Prerequisites:

* Node 14+ and npm.
* Environment variables: `GOOGLE_API_KEY` or `OPENAI_API_KEY`.

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run the dev server
npm start
```

## 6.  Extending the Agent System

* Add new LLM backends by editing `resolveModel()`.
* Create new agents and plug them into the `lab.js` orchestrator.
* Swap the serial workflow for a task queue (e.g., Bull, Redis Queue) for high‑volume docs.

---

**TL;DR**: This repository stitches together a React UI, an Express backend, and a tiny set of LLM‑powered agents to deliver compliance checks automatically.  The `Evaluator` agent described in `src/labs/evaluator.ts` is the core LLM integration point.

---

Contact the maintainer for questions on the agent API or to propose new compliance rules.
