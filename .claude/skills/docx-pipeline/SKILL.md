---
name: docx-pipeline
description: Architecture reference for Andrei's Word pipelines: DOCX import (mammoth + OOXML enrichment, comment extraction, anchor matching) and DOCX export (docxtemplater templates, TipTap to Word XML, post-processing passes). Load before changing src/lib/import/, src/lib/export/, or any templates/*.docx.
---

## Subsystem: DOCX Import

Investigation-report import. **Entry point:** `docxBufferToImportedReportContent()` in `src/lib/import/docx-to-sections.ts`. Design-verification import/export uses the type’s `templatePath` / merge helpers in `src/lib/document-types/`.

**Pipeline stages:**
1. Mammoth converts DOCX → markdown (preserves list numbering) and → HTML (preserves table structure)
2. Markdown split by section heading regex into Define/Measure/Analyze/Improve/Control
3. `buildSectionsFromRaw()` converts raw text → TipTap JSONContent per section. Analyze gets special handling for 6M fields, 5-Why, root cause levels, impact assessment.
4. Table injection: HTML tables matched to flat paragraphs by cell-text sequence, replaced with TipTap table nodes. Merged cells expanded (value repeated in every covered row/column).
5. `enrichNarrativesFromDocxBuffer()` in `docx-rich-content.ts` bypasses mammoth to extract direct OOXML formatting: bold, italic, underline, colors, subscript, superscript, OMML equations (→ MathML), images. Matches OOXML paragraphs to mammoth output by plain-text similarity with media placeholder normalization (`[image:...]` and `[equation]` → `[media]`).
6. Legacy WMF/EMF equation previews sent to vision LLM for math extraction (falls back to `[formula]` placeholder).
7. `extractWordCommentsFromDocxBuffer()` extracts comments from comments.xml, maps to sections by anchor text. Duplicate anchors in same section grouped into threads.

**Returns:** `{ sections, toolsUsed, header (date/deviation#), comments }`

**Key invariant:** Anchor text matching uses substring inclusion only when both sides are ≥12 chars, preventing stray short strings from overwriting paragraphs.

## Subsystem: DOCX Export

**Entry point:** `generateReportDocx()` in `src/lib/export/generate-docx.ts`. Investigation, design-verification, and generic-document are separate branches (IR template vs `templates/design-verification-report-template.docx` vs `templates/generic-document-template.docx`). The numbered pipeline below is the investigation-report path. Registry `export.templatePath` exists but generate-docx still hardcodes those paths. Generic export maps Heading1–3 (when `useHeadingStyles`), skips investigation checkboxes/signature blocks, and sets `w:trackRevisions` so pending insert/delete marks survive as Word tracked changes.

**Pipeline:**
1. Load template DOCX (`templates/investigation-report-template.docx`) via PizZip + Docxtemplater
2. Per-section generators convert TipTap JSONContent → Word XML (`<w:p>`, `<w:r>`, `<w:rPr>`) via `narrativeToDocxXmlWithContext()`. Handles bold, italic, underline, colors, subscript, superscript, images, OMML equations. Quantity TeX (`$<1$`, `$\pm$`, `$\le$`) flattens to Unicode `w:t`; remaining OMML `m:t` is XML-escaped so a raw `<` cannot corrupt `document.xml`. Never emit empty for leftover math.
3. Analyze section formats 6M fields, 5-Why pairs, investigation outcome, root cause, impact assessment
4. Improve/Control split into narrative + CA-N/PA-N register tables (`improve-control-checkpoints-docx.ts`)
5. Post-processing passes:
   - `applyInvestigationToolCheckboxes()` — toggles SDT checkboxes for 6M/5-Why/Brainstorming
   - `applyInlineMediaToDocxZip()` — embeds images as base64
   - `applyNumberingToDocxZip()` — preserves list formatting
   - `applyWordCommentsToDocxZip()` — injects comments into comments.xml with thread parent/child linking
   - `applySignatureBlockToDocxZip()` — approval table
   - `applyGoogleDocsImageCompat()` — image compatibility

**Output:** Binary buffer matching `reference-template.docx` layout (header with logo, DMAIC sections, CAPA registers, signature table, footer with page numbers).
