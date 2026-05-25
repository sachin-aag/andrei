---
iteration: 2
max_iterations: 15
completion_promise: "COMPLETE"
---

Fix DOCX formula rendering in the web UI. Input: docs/Draft Investigation (DEV-QC-26-001).docx. Legacy Equation Editor formulas (WMF previews) must render in the Tiptap editor instead of showing [unsupported WMF image]. Test with parser and/or Playwright until document rendering works.

Progress: WMF META_ESCAPE sanitization + server-side PNG conversion at import implemented. Tests pass.
