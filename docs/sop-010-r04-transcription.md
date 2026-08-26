# SOP/DP/QA/010 R04 — F02 / F04 transcription

Source: [docs/sample_files/SOP-DP-QA-010-R04 SOP.pdf](sample_files/SOP-DP-QA-010-R04%20SOP.pdf)
(scanned MASTER COPY; page numbers are the printed “Page N of 51”.)

Landscape / rotated form pages were read as images. Numbers below are cited
to those pages. Do not change scoring constants without a matching citation.

## 1. F02 field inventory (pp. 28–41)

Form: **SOP/DP/QA/010/F02-R04 — Template for Risk Assessment by FMEA**.

### Cover (p. 28)

| Field | Required |
|---|---|
| Title | yes |
| Department | yes |
| Risk Assessment No. | yes |
| System / Equipment / Facility / Instrument / other Name | yes |
| Source Document Name (If any) | optional |
| Source Document No. (If any) | optional |
| Product / Process / Equipment / System / Other name | yes |
| ID No. (If Applicable) | optional |

### Table of contents (p. 29)

A. Pre-Approval → 1 Details of Risk Assessment (1.1–1.8) → 2 Risk identification
and evaluation → 3 Risk Communication (3.1 pre-implementation conclusion) →
4 Mitigation plan and closure (4.1 F04 residual/new risk, 4.2 periodic review,
4.3 post-implementation conclusion) → B. Revision History → C. Post-Approval.

### A. Pre-Approval (p. 30)

Table: Name | Designation & Department | Signature | Date, for Performed By
(User Dept.), Reviewed By (Risk Assessment Team Members), Approved By
(Head QA/Designee). Print placeholders in Word; not an app workflow gate.

### 1. Details of the risk assessment (pp. 31–36)

- **1.1 Objective** — purpose including equipment / process / activity name.
- **1.2 Scope** — applicability at the Drug Product facility, Pune.
- **1.3 Overview** — functions, intended use, components, process flow.
- **1.4 Procedure** — QRM initiation steps + A01 flow chart.
- **1.5 Team members** — Sr. No. | Name | Department | Designation.
- **1.6 Risk identification** — S. No. | Process / activity | Identify Failure.
- **1.7** Formal vs informal assessment (decision tree A02).
- **1.8** Approach: quantitative uses 1–5 S/P/D and RPN; qualitative uses
  Low/Medium/High and the RPR matrix (same tables as SOP body pp. 11–15).

### 2. FMEA grid (p. 37)

See §2 below. Risk IDs start at **R01**.

### 3. Risk communication (p. 38, rotated)

Table of mitigation proposals with a unique code per proposal, plus
**3.1 Risk Assessment Summary and Conclusion (Before Implementation)**.

### 4. Mitigation plan and closure (p. 39, rotated)

Tracker: Sr. No. | Mitigation Plan | Reference | Proposed change | Actual
change | Completion Date | Closure Date | Sign/Date.

- **4.1** New / residual risk → F04 (SOP/DP/QA/010/F04).
- **4.2 Periodic review** — temporary changes are not reviewed. Review applies
  when the assessment can impact product quality, safety, identity, purity, or
  strength. Checkbox: applicable Yes/No + justification.
- **4.3** Summary and conclusion **after** implementation (p. 40).

### B / C (p. 41)

Revision history: Revision No. | Change | Change History No.
Post-approval: same signature table as pre-approval, after implementation.

## 2. FMEA grid columns (p. 37)

Printed left to right:

1. Sr. No. (seeded `R01`)
2. Process / activity
3. Potential Failure
4. Probable cause of failure
5. Potential Effect(s) of Failure
6. Severity (S)
7. Control Measures
8. Probability (P)
9. Detection Measures
10. Detectability (D)
11. *(S×P×D) — write **RPN** or **RPR** depending on approach
12. Risk Acceptable (Yes/No)
13. Mitigation Plan
14. Responsibility and TCD
15–18. Revised Risk Classification: S, P, D, Final *(S×P×D)
19. Risk Acceptable (Yes/No) after mitigation

Font size 10; page may be A4 or A3 (SOP 7.3.2.10, p. 8).

## 3. Quantitative rubric (pp. 13–14; restated on F02 p. 34)

`RPN = S × P × D`. Each factor is **1–5**. Detectability 1 = easy to detect
(better); 5 = no detection possible (worse).

| Score | Severity | Probability | Detectability |
|---|---|---|---|
| 1 | No impact | Infrequently, yearly, or >1 year | Very high / complete detection possible |
| 2 | Low impact (may have indirect impact) | Low frequency e.g. half-yearly | High possibility of detection |
| 3 | Medium / moderate impact (will have indirect impact) | Moderate frequency e.g. quarterly | Medium / moderate possibility of detection |
| 4 | High impact (may have direct impact) | Repeated e.g. weekly | Low possibility of detection |
| 5 | Very high impact (will have direct impact) | Regularly, >1 occurrence per day | No detection possible |

## 4. RPN bands (Table 06, p. 15; F02 p. 34)

Confirmed against the scan (OCR of “High” as “95–125” is wrong).

| Overall risk | RPN | Treatment |
|---|---|---|
| Low | 1–8 | Mitigation not required; risk acceptable. Assessment may be closed (7.4.4). |
| Medium | 9–24 | Mitigation required to reduce the risk; after mitigation the risk can be acceptable (Table 03 / R02 wording, p. 13 / 21). |
| High | 25–125 | Identify and implement mitigation **before proceeding** with the activity (7.4.7). |

Mitigation is mandatory for Medium and High (7.4.5). Plan must name the action,
responsible person, and target completion date (7.4.8).

## 5. Qualitative rubric and RPR matrix (pp. 11–12; F02 p. 35)

Informal = qualitative = RPR as High / Medium / Low (7.3.2.9.1, p. 8).
**Do not multiply qualitative labels.** Use the lookup.

### Table 01 ranks (p. 11)

| Rank | Severity | Probability | Detectability |
|---|---|---|---|
| Low | No impact or low (may have indirect impact) | Infrequently, yearly, or one occurrence >1 year | Very high / complete detection possible |
| Medium | Medium / moderate (will have indirect impact) | Half-yearly or quarterly | Medium / moderate possibility of detection |
| High | High (direct impact) | Regularly, more than weekly or per day | No detection possible |

### Table 02 lookup (p. 12), all 27 combinations

R01 (p. 20) restates the non-obvious cells; they match the matrix.

| S | P | D | RPR |
|---|---|---|---|
| High | High | High | High |
| High | High | Medium | High |
| High | High | Low | High |
| High | Medium | High | High |
| High | Medium | Medium | High |
| High | Medium | Low | Medium |
| High | Low | High | High |
| High | Low | Medium | Medium |
| High | Low | Low | Low |
| Medium | High | High | High |
| Medium | High | Medium | High |
| Medium | High | Low | Medium |
| Medium | Medium | High | High |
| Medium | Medium | Medium | High |
| Medium | Medium | Low | Medium |
| Medium | Low | High | Medium |
| Medium | Low | Medium | Medium |
| Medium | Low | Low | Low |
| Low | High | High | High |
| Low | High | Medium | Medium |
| Low | High | Low | Low |
| Low | Medium | High | Medium |
| Low | Medium | Medium | Medium |
| Low | Medium | Low | Low |
| Low | Low | High | Low |
| Low | Low | Medium | Low |
| Low | Low | Low | Low |

Qualitative treatment (Table 03, p. 13) matches the RPN treatment labels
(Low / Medium / High) without numeric bounds.

## 6. A02 decision logic (p. 23 annexure; F01 questions p. 26)

F01 / A02 questions:

1. Is there potential impact on product quality, **or** is the GMP system known
   and understood?
2. Is the scope well defined?
3. Is the scope narrow?

- **Yes to all three** → Informal QRM → **qualitative**.
- **No to any one** → Formal QRM → **quantitative**.

If the identified risk can already be mitigated by existing QMS elements, A02
says follow the site procedure (no new QRM). That gate is outside F02 drafting.

## 7. F04 fields (pp. 43–45)

**SOP/DP/QA/010/F04-R00 — Template for New Risk / Residual Risk.**

Cover repeats F02 identity fields. Grid (p. 45) uses the same S/P/D / RPN-or-RPR
/ mitigation / revised-score columns as F02. Sr. No. is a unique code; new rows
start at R01 on F04, and a continuing initial risk keeps its original ID
(note on p. 45). Same RPN/RPR footnote. Process flow matches the initial
assessment, including pre- and post-approval summaries (7.3.2.15, p. 8).

## RA-number format

Not printed as a regex in this SOP. UI placeholder until MJ confirms:
`RA/DP/QA/YY/NNN`.
