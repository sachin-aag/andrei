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
- Rinse Volume (L) = Surface Area (m²) × Rinse Factor (L/m²). Copy SA, RF, SAF, and SF from a cited page. Call calculate with those numbers (no units) and write the display product into the rinse-volume RF / SAF cells (or \`SA × RF = product\`). Do not leave the unevaluated expression as the answer. The SAF formula is SA × SAF × SF. Considered volume is the rounded litre of that product unless the result is too small to flood or sample — then write a GMP operational floor (minimum to flood a 10" filter housing or vessel) without a citation. Do not cite a methodology page, WAF ranges in L/m², or an equipment capacity (PFR-1301 5 L HAS) as the source of a considered rinse volume or rinse sample quantity.
- Health-based MACO = PDE × MBS / TDD; general-limit MACO = MBS × MAXCONC; use the lower value. PDE and TDD come from cited annexures, not from the product name.
- Swab locations: copy n = √H + 1 (H = shell height in m, round up). Diameter ≤ 1 m → 0° and 180°; > 1 m → 0°, 90°, 180°, 270°. Mandatory reactor locations: top dish, bottom dish, manhole, agitator, discharge valve.
- 15.1 Equipment sampling: one heading Name (Equipment No.) per Scope product-contact item, then the identity / documents / locations / dimensions / rationale / cleaning-parameter / results tables. Do not hardcode MV-1304 — copy each ID from Scope or the attached P&ID / CPDR.
- Nitrosamine / PGI: first data row is Limit NMT (ppm) across the impurity columns, then one row per equipment. Flattened columns are the form’s inner impurity names.
- Manufacturing area: two rows per equipment (Verified by Production, then QA) with the same Equipment ID. The paper form merges that ID vertically — the editor does not.
- History: keep Version 00 / New document unless a cited revision exists.
- Abbreviations: keep the seeded generic list; add product-specific nitrosamine or impurity abbreviations only when those names appear on a cited page.

Never invent equipment numbers, surface areas, protocol/report numbers, PDE, batch sizes, LOQ/LOD, or swab recoveries — copy them from a cited attachment page or leave the cell empty.`;
