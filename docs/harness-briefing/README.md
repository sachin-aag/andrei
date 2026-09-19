# Chat harness briefing (junior engineer)

Three illustrated PDFs for someone joining the report-chat control plane.
They explain **how the harness works today**, not the incident backlog.

If a briefing disagrees with code, trust the code — then fix the HTML here
and reprint the PDF.

Living plans (status, subtract-first work): [`../harness-plan.md`](../harness-plan.md)
and [`../retrieval.md`](../retrieval.md).

## Read in order

| # | PDF | What it covers |
|---|-----|----------------|
| 1 | [01-architecture.pdf](01-architecture.pdf) | Layers (harness vs retrieval vs Gemini), POST lifecycle, file map |
| 2 | [02-control-plane.pdf](02-control-plane.pdf) | `ChatTurnPlan`, intent, retrieval policy, `prepareReportChatStep`, F1 scenarios |
| 3 | [03-retrieval-grounding.pdf](03-retrieval-grounding.pdf) | Hybrid search, search-loop hide rules, document-review phases, fact gate, compaction / 270s abort |

Mental model: the LLM proposes, the harness constrains, the engineer
Applies. Live report chat always writes `ai_fix` comments plus red/green
marks. Nothing lands in `report_sections` until Apply / Dismiss.

## Reprint

HTML next to each PDF is the source. Chrome print-to-PDF:

```bash
google-chrome --headless=new --disable-gpu --no-sandbox \
  --no-pdf-header-footer \
  --print-to-pdf=docs/harness-briefing/01-architecture.pdf \
  docs/harness-briefing/01-architecture.html
```

Repeat for `02-control-plane` and `03-retrieval-grounding`.
