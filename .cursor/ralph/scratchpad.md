---
iteration: 1
max_iterations: 5
completion_promise: "DOCX import/render/export issues for DEV-PK-25-002 are fixed and verified"
---

Implement the DOCX parsing/UI/export fix plan for DEV-PK-25-002:

- Separate template guidance/checklist text from editable section content and show guidance as read-only reference panels in the web UI.
- Fix DOCX import so numbered guidance is stripped consistently and authored content remains visible in the right section.
- Parse and persist report-level investigation tools from uploaded DOCX headers so 6M / 5 Why / Brainstorming checkboxes are correctly ticked.
- Replace structured 5-Why rows with one large 5-Why narrative textbox plus a separate conclusion field, preserving compatibility with older stored whys.
- Ensure Measure regulatory notification content is visible/editable in the web UI and still exports.
- Update export/template behavior so the single 5-Why narrative and ordered guidance/reference text are represented correctly.
- Add focused regression tests and run appropriate verification.
