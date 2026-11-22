/**
 * Complete, audit-ready TipTap templates for the first three M&A Integration
 * documents in the demo gallery (converted via `markdownToDoc` with
 * `headingNodes: true`).
 */

export const DOCUMENT_TEMPLATE_TRANSFER_TEMPLATE = `# Document & Template Transfer Plan

| Document Control | Value |
| --- | --- |
| **Document Number** | <transfer plan number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Acquired Entity / Site** | <acquired entity & site> |
| **Target Acquirer QMS** | <acquirer QMS platform> |
| **Integration QA Lead** | <integration QA lead> |
| **Transaction Close Date** | <deal close date> |
| **Target QMS Cutover Date** | <target cutover date> |

## 1. Purpose, Scope & Cutover Strategy
This plan governs the controlled migration of Standard Operating Procedures (SOPs), Work Instructions (WIs), Forms, Policies, and Document Templates from **<acquired entity & site>** into the **<acquirer company>** Quality Management System (**<acquirer QMS platform>**).

- **In-Scope Document Classes:** Quality Manual/Policies, Site and Corporate SOPs, Manufacturing/QC Work Instructions, Controlled Forms, and Word/PDF Templates.
- **Disposition Options:** **Adopt Corporate** (replace legacy doc with existing acquirer SOP), **Migrate & Remap** (transfer into acquirer QMS under new number/template), **Retain Site-Local** (site-specific operational procedure maintained under acquirer control), or **Retire / Obsolete**.
- **Day-1 Interim Rule:** Until each migration wave reaches cutover, legacy procedures remain legally effective under the Transitional Quality Plan (<transitional plan ref>) with zero dual-conflicting revisions on the shop floor.

## 2. Integration Governance & Transfer Team

| Role | Acquirer Representative | Acquired-Site Rep. | Core Responsibilities |
| --- | --- | --- | --- |
| **QA Integration Lead** | <acquirer QA lead> | <acquired QA lead> | Overall QMS harmonization, gap sign-off, and cutover authorization. |
| **Document Control** | <acquirer doc control> | <acquired doc control> | Numbering allocation, template formatting, routing, and archival. |
| **Regulatory Affairs** | <acquirer RA lead> | <acquired RA lead> | Assess impact on notified body / FDA submissions and ISO 13485 certs. |
| **Operations & Eng.** | <acquirer ops lead> | <acquired ops lead> | Reconcile technical WIs, inspection forms, and shop-floor copies. |
| **Training / LMS** | <acquirer LMS lead> | <acquired LMS lead> | Map role curricula and verify pre-effective training completion. |

## 3. Master Document Inventory & Disposition Register

| Legacy Doc No. | Legacy Title & Rev | Type | Disposition | Target Doc No. | Owner | Wave | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <legacy doc 1> | <doc 1 title & rev> | SOP | <disposition> | <acquirer doc no.> | <owner> | Wave 1 | <status> |
| <legacy doc 2> | <doc 2 title & rev> | WI | <disposition> | <acquirer doc no.> | <owner> | Wave 2 | <status> |
| <legacy doc 3> | <doc 3 title & rev> | Form | <disposition> | <acquirer doc no.> | <owner> | Wave 2 | <status> |

## 4. Numbering, Template & Workflow Remapping Rules

| Element | Legacy Convention | Target Convention | Conversion Rule |
| --- | --- | --- | --- |
| **Document Numbering** | <legacy numbering> | <acquirer numbering> | Record legacy doc number in metadata/cross-reference table for audit traceability. |
| **Templates & Layouts** | <legacy templates> | <acquirer template ref> | Re-format migrated docs into standard Word templates; preserve technical tables verbatim. |
| **Approval Routing** | <legacy sign-off roles> | <acquirer approval SOP> | Route through harmonized QA and functional approvers under <change control ref>. |
| **Periodic Review Cycle** | <legacy review cycle> | <acquirer review cycle> | Reset next review date from effective cutover date unless regulatory mandate is shorter. |

## 5. Migration Waves & Training Cutover

| Wave | Document Scope | Draft Complete | QA Approval | Training Window | Go-Live Date |
| --- | --- | --- | --- | --- | --- |
| **Wave 1 (Critical QMS)** | Doc Control, CAPA, Deviations, Change Control, Complaints | <date> | <date> | <training window> | <go-live date> |
| **Wave 2 (Core Ops)** | Manufacturing WIs, Incoming QC, Calibration, Suppliers | <date> | <date> | <training window> | <go-live date> |
| **Wave 3 (Supporting)** | Remaining forms, templates, and site-specific SOPs | <date> | <date> | <training window> | <go-live date> |

**Controlled Copy Recall:** On each wave's go-live date, Document Control retrieves and destroys all paper controlled copies of superseded legacy documents and locks legacy electronic repositories to read-only archival.

## 6. Gaps, Retirements & Temporary Dual-Control Risks

| Gap ID | Legacy / Acquirer Discrepancy | Impact Assessment | Interim Control / Resolution | Owner | Target Date |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | <unmapped legacy SOP> | <impact assessment> | <resolution plan> | <owner> | <date> |
| GAP-02 | <policy conflict> | <compliance impact> | <bridging addendum> | <owner> | <date> |

## 7. Close-Out Verification & Approvals
- **Exit Criteria:** 100% of inventoried documents dispositioned (migrated, adopted, retained, or formally retired), legacy cross-reference index archived, training ≥ 95% complete prior to effective date, and legacy paper copies recalled.

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Document Control Lead** | <acquirer doc control> | <role> | <status> | <date> |
| **Acquired-Site QA Lead** | <acquired QA lead> | <role> | <status> | <date> |
| **Acquirer QA Approver** | <acquirer QA lead> | <role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <acquirer doc control> | Initial Document & Template Transfer Plan. |
`;

export const DHF_DMR_TRANSFER_TEMPLATE = `# DHF & DMR Transfer Plan & Completeness Record

| Document Control | Value |
| --- | --- |
| **Document Number** | <transfer record no.> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Acquired Entity / Site** | <acquired entity> |
| **Product Families in Scope** | <product families> |
| **Target Acquirer PLM / QMS** | <acquirer PLM / QMS> |
| **R&D / PLM Transfer Lead** | <R&D / PLM lead> |
| **QA Integration Approver** | <QA lead> |

## 1. Purpose & Product Scope
This record plans, executes, and verifies the complete transfer and re-indexing of the Design History File (DHF) and Device Master Record (DMR) for **<product families>** into **<acquirer PLM / QMS>**, preserving full regulatory traceability under 21 CFR 820.30(j), 21 CFR 820.181, and ISO 13485 §4.2.3 / §7.3.10.

- **Active Regulatory Clearances / Technical Files:** <clearance numbers> (510(k) / PMA / EU MDR / UKCA)
- **Manufacturing Sites Covered:** <manufacturing sites>
- **Legacy Source Repositories:** <legacy repositories>

## 2. Design History File (DHF) Inventory & Completeness Check

| DHF Element | Legacy Doc ID & Rev | Completeness | Target Acquirer ID | Owner | Gap / Remediation |
| --- | --- | --- | --- | --- | --- |
| **Design & Development Plan** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **User Needs / URS** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Design Inputs & Specs** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Design Outputs & Reviews** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Design Verification (V&V)** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Design Validation & HF** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Risk Management File** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |
| **Design Transfer & Matrix** | <legacy doc & rev> | <status> | <acquirer ID> | <owner> | <GAP ID or None> |

## 3. Device Master Record (DMR) Inventory

| DMR Category | Legacy BOM / Doc ID | Target PLM ID | Production Site | Completeness | Notes |
| --- | --- | --- | --- | --- | --- |
| **Specs, Drawings & BOMs** | <legacy BOM ref> | <acquirer PLM ID> | <site> | <status> | <CAD / native check> |
| **Process Specs & Equipment** | <legacy WI ref> | <acquirer PLM ID> | <site> | <status> | <tooling & fixtures> |
| **QA & Acceptance Specs** | <legacy QC spec> | <acquirer PLM ID> | <site> | <status> | <sampling & methods> |
| **Packaging, Labels & UDI** | <legacy label ref> | <acquirer PLM ID> | <site> | <status> | <artwork & barcodes> |
| **Installation & Servicing** | <legacy service ref> | <acquirer PLM ID> | <site> | <status> | <field service docs> |

## 4. Re-Indexing, Revision & Metadata Rules
1. **Cross-Reference Preservation:** Every migrated DHF/DMR record retains its exact legacy document number and revision in a searchable metadata field (Legacy Reference ID) so historical audit citations resolve immediately.
2. **Revision Integrity:** Approved historical DHF records are migrated as immutable released PDF/native packages without altering historical signatures; active DMR documents roll to the next acquirer revision only via approved Change Control (<change control ref>).
3. **Traceability Verification:** Spot-check **<audit sample %>** (e.g., 100% of safety-critical items) of requirements-to-verification links after re-indexing to confirm zero broken links.

## 5. Completeness Audit Findings & Remediation Actions

| Gap ID | DHF / DMR Element | Audit Finding | Risk | Remediation Action | Owner | Target Date | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DHF-01 | <DHF element> | <finding summary> | <risk> | <remediation action> | <owner> | <date> | Open |
| DHF-02 | <DMR element> | <finding summary> | <risk> | <ECO reconciliation> | <owner> | <date> | Open |

## 6. Post-Cutover Ownership, Access & Archival
- **Post-Cutover Record Owners:** R&D / Sustaining Engineering owns DHF technical updates; Manufacturing Engineering owns DMR process specs; Quality Assurance owns final release and inspection readiness.
- **Permissions & Security:** Role-based access configured in <acquirer PLM / QMS>; edit rights restricted to authorized engineering/doc-control roles.
- **Legacy Archival:** Legacy repositories placed in read-only archival with verified checksum/backup integrity for at least <retention period> per 21 CFR 820.180 and EU MDR retention mandates.

## 7. Close-Out Sign-Off & Revision History
All in-scope DHF and DMR artifacts are verified complete, searchable, and audit-ready in **<acquirer PLM / QMS>**.

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **R&D / PLM Lead** | <R&D / PLM lead> | <lead role> | <status> | <date> |
| **Manufacturing Lead** | <mfg lead> | <lead role> | <status> | <date> |
| **Regulatory Affairs** | <RA reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA lead> | <approver role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <R&D / PLM lead> | Initial DHF & DMR Transfer Plan and completeness record. |
`;

export const RISK_FILE_TRANSFER_TEMPLATE = `# Risk Management File Transfer & Harmonization Plan

| Document Control | Value |
| --- | --- |
| **Document Number** | <transfer number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Acquired Entity** | <acquired entity> |
| **Product / Process Scope** | <products & processes> |
| **Acquirer Risk SOP Ref** | <acquirer Risk SOP> |
| **Risk Management Lead** | <risk management lead> |
| **QA Integration Approver** | <QA approver> |

## 1. Purpose & Regulatory Alignment
This plan defines the controlled transfer, scale harmonization, and control re-linkage of Risk Management Files (Risk Management Plans, Hazard Analyses, DFMEAs, PFMEAs, uFMEAs, and Risk Management Reports) from **<acquired entity>** into the **<acquirer company>** ISO 14971:2019 framework (<acquirer Risk SOP>).

**Key Principle:** Scale harmonization must never silently downgrade a previously identified clinical harm or sever traceability to approved design controls, V&V evidence, or labeling warnings.

## 2. Source Risk Files Inventory

| Legacy File ID | Document Title | Artifact Type | Rev | Last Review | Target ID | Status |
| --- | --- | --- | --- | --- | --- | --- |
| <legacy RMP ID> | <RMP title> | RMP | <rev> | <date> | <acquirer ID> | <status> |
| <legacy HA ID> | <Hazard Analysis title> | Hazard Analysis | <rev> | <date> | <acquirer ID> | <status> |
| <legacy DFMEA ID> | <DFMEA title> | DFMEA | <rev> | <date> | <acquirer ID> | <status> |
| <legacy PFMEA ID> | <PFMEA title> | PFMEA | <rev> | <date> | <acquirer ID> | <status> |
| <legacy RMR ID> | <RMR title> | RMR | <rev> | <date> | <acquirer ID> | <status> |

## 3. Methodology & Scale Crosswalk
Map legacy rating definitions explicitly to acquirer ISO 14971 scales before converting individual risk rows.

| Methodology Element | Legacy Acquired-Site Method | Acquirer Standard | Harmonization Rule |
| --- | --- | --- | --- |
| **Severity Scale** | <legacy severity scale> | <acquirer severity> | Map conservatively (when spanning two tiers, assign the higher severity). |
| **Probability / Occurrence** | <legacy occurrence> | <acquirer probability> | Re-anchor to post-market complaint rates where field data exists. |
| **Detectability (FMEA)** | <legacy detectability> | Engineering FMEA only | Keep detectability strictly in engineering FMEAs, never in patient risk matrix. |
| **Acceptability Zones** | <legacy risk zones> | <acquirer risk matrix> | Any item moving into Unacceptable triggers mandatory remediation or benefit-risk review. |
| **Benefit-Risk Criteria** | <legacy BR policy> | <acquirer BR SOP> | Clinical / Medical Affairs must co-sign any retained benefit-risk justification. |

## 4. Reformatting & Requirements / Controls Re-Linkage Plan
1. **Unique ID Preservation:** Retain legacy Hazard IDs and FMEA line IDs in a dedicated reference column alongside newly assigned acquirer Risk IDs.
2. **Design & Process Control Re-Linkage:** Update every risk control reference from legacy document numbers to migrated acquirer Design Specifications (<DHF transfer ref>), Process Controls, IFU sections, and Verification/Validation report IDs.
3. **Narrative vs. Tabular Split:** Preserve clinical benefit-risk arguments and overall residual risk rationale in the Risk Management Report narrative; migrate hazard/failure-mode rows into the acquirer's standardized tabular template.

## 5. Score Shift & Residual Risk Gap Assessment
Document every risk item whose acceptability zone worsens under acquirer scales or whose verification link is incomplete.

| Risk ID | Hazard / Failure Mode | Legacy Zone | Acquirer Zone | Score Shift Impact | Required Action / Rationale | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <RSK-01> | <hazard 1> | <legacy zone> | <acquirer zone> | <shift impact> | <action or rationale> | <owner> | Open |
| <RSK-02> | <failure mode 2> | <legacy zone> | <acquirer zone> | <missing V&V link> | <re-link to DVR> | <owner> | Open |

## 6. Post-Production & PMS Feedback Integration
- Connect migrated risk files to the acquirer's Complaint Handling, CAPA, Trend Review, and EU MDR PSUR / PMS reporting cadence (<PMS SOP ref>).
- Establish the next scheduled Risk Management File review date: **<next review date>**.

## 7. Close-Out Approval & Revision History
All in-scope risk files have been harmonized to **<acquirer Risk SOP>**, re-linked to migrated controls, and reviewed for residual risk acceptability.

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Risk Management Lead** | <risk management lead> | <lead role> | <status> | <date> |
| **R&D / Ops Reviewer** | <technical reviewer> | <reviewer role> | <status> | <date> |
| **Clinical / Medical** | <clinical reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <risk management lead> | Initial Risk File Transfer & Harmonization Plan. |
`;
