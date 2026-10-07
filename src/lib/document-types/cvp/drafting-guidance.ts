export const CVP_DRAFTING_GUIDANCE = `CLEANING VERIFICATION PROTOCOL (3xper QAD-SOP-PS-003-F08-00) — DRAFTING RULES

One protocol covers the cleaning verification of the manufacturing equipment train for one product / stage at one plant (e.g. Production Block-2). Write in formal GMP protocol language, 3xper Innoventure Limited, Naidupeta as the site. Future tense / “shall” for the protocol; do not write executed results unless a cited cleaning record or chromatogram is on this turn.

Cover identity (draft_identity, no citations): Protocol No. (CVRP-…), Name of the product, Product Code, Stage, Plant, Department (usually Production), Version, Effective Date, Document Title. Copy those from the protocol cover or change-control / CPDR header. Do not invent a protocol number.

Do not generate:
- Word drawings, grouped shapes, arrows, or text-box stacked fractions (MACO PDE×MBS/TDD brackets in the source form). Write the same arithmetic as table rows Attribute | Description | Value / Calculation, or as Unicode (n = √H + 1, SA × RF).
- Equipment-train diagrams, PFR flow schematics, swab-stroke figures, or labelled vessel sketches (S-1 on the top dish). Describe locations in tables (Location ID | Description). Use insert_image only when a cited attachment page is a figure the engineer asked to place.
- Two-row merged headers (Nitrosamine spanning NDMA…NDBA; PGI spanning three impurities; qualification dates on a continuation row under the protocol number). Use the seeded flat columns. One editor row per equipment (or Production then QA for manufacturing-area).
- Highlighted yellow “filled” cells, handwritten signatures, or chromatograms.

Do generate:
- Objective / Scope / Pre-requisites / Methodology / Sampling procedure / Swab locations / Evaluation / Deviations / Revalidation as prose from cited CPDR, PDR, BCR, qualification reports, and site SOPs.
- Tables with the seeded headers. Keep column order. Empty unused shells stay one blank row.
- Scope, Background (cleaning method / solvent), Qualification status, Surface area, Rinse-volume calculation, MACO equipment list, per-equipment rinse limits, Equipment sampling blocks, Process lines, Manufacturing area, Overall results, Testing procedure, Method validation status, Related documents, Annexures.

Standard pieces:
- Responsibilities: keep the seeded department rows; do not invent new functions. Fill only if a cited SOP names a different owner.
- WAF table (9.0): keep the four surface-type rows (polished SS, rough SS, glass lined, PTFE/Halar) unless a cited page prints different factors.
- Rinse Volume (L) = Surface Area (m²) × Rinse Factor (L/m²). Copy RF, SAF, SF, considered volume, and sample quantity from a cited page. The SAF formula is SA × SAF × SF. Write those as Unicode prose or table rows — never wrap them in \`$$...$$\` or \`\\text{...}\`. Keep \`$$...$$\` only for a stacked fraction (\`\\frac\`).
- Health-based MACO = PDE × MBS / TDD; general-limit MACO = MBS × MAXCONC; use the lower value. PDE and TDD come from cited annexures, not from the product name.
- MACO (10.0) is three tables in one narrative. tableIndex 0 = equipment list (S. No. | Name of the Equipment | Equipment No. | Capacity | MOC | …). tableIndex 1 = health-based formula (Attribute | Description of Attribute | Value / Calculation — PDE, MBS, TDD, MACO). tableIndex 2 = general-limit formula (same three columns — MAXCONC, MBS, MACO). Copy tableIndex from read_section. Never draft_field this field. Never insert_rows of the formula headers into table 0.
- Swab locations: copy n = √H + 1 (H = shell height in m, round up). Diameter ≤ 1 m → 0° and 180°; > 1 m → 0°, 90°, 180°, 270°. Mandatory reactor locations: top dish, bottom dish, manhole, agitator, discharge valve.
- Equipment sampling (15.1, 15.2, …): one TipTap box per Scope product-contact item. The empty section seeds **one** 15.1 box. Add equipment (or draft_field \`items.N\` on a blank extra box) for the next item — that new box is always the empty 15.N template, never a copy of the previous equipment's filled tables. Numbering updates automatically. Do not dump 15.1–15.10 into one field. Under each box keep this inner outline as \`###\` / \`####\` headings (do not fake them with bold paragraphs):
  - 15.N.1 Equipment details (identity table Parameter | Details | Reference)
  - 15.N.2 Supporting Documents and References (Documents | Document # | Effective / Approval date)
  - 15.N.3 Swab sampling locations determination
    - 15.N.3.1 Worst-case locations (Location ID | Description)
    - 15.N.3.2 Calculation for shell wall swab locations (Parameter | Calculation | Value | Remarks) when the item is a vessel
    - 15.N.3.3 Pictorial representation — describe locations; do not invent a drawing
    - 15.N.3.4 Rationale for swab sample locations (Swab ID | Description | Rationale | No. of samples)
  - 15.N.4 Cleaning operation results summary
  - 15.N.5 Cleaning validation results summary
  - 15.N.6 Visual inspection summary
  - 15.N.7 Reflux, Swab & Rinse samples analysis results summary
  - 15.N.8 Extraneous matter
  Rename the H2 with propose_edit (\`15.1 Glass Lined Reactor (GLR-1302)\` — plain title text, not a second \`##\` sibling). Fill seeded tables with edit_table; never draft_field a box that already has more than one table. draft_field is only for a cleared / blank box. Do not paste a second 15.N outline, Duplicate-this-box instructions, empty 15.N.1–15.N.8 headings, or Inference/Conclusion placeholders into a box that already has those headings or tables — edit the live grids in place. Do not caption an unused seed identity table as Table N. Nitrosamine and PGI follow the last equipment block — do not number them 15.11 / 15.12. Do not hardcode MV-1304 — copy each ID from Scope or the attached P&ID / CPDR.
- Nitrosamine / PGI: first data row is Limit NMT (ppm) across the impurity columns, then one row per equipment. Flattened columns are the form’s inner impurity names.
- Manufacturing area: two rows per equipment (Verified by Production, then QA) with the same Equipment ID. The paper form merges that ID vertically — the editor does not.
- History: keep Version 00 / New document unless a cited revision exists.
- Abbreviations: keep the seeded generic list; add product-specific nitrosamine or impurity abbreviations only when those names appear on a cited page.

Never invent equipment numbers, surface areas, protocol/report numbers, PDE, batch sizes, LOQ/LOD, or swab recoveries — copy them from a cited attachment page or leave the cell empty.`;
