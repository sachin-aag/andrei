/**
 * Complete, audit-ready TipTap templates for the first three Supply Chain
 * documents in the demo gallery (converted via `markdownToDoc` with
 * `headingNodes: true`).
 */

export const SUPPLIER_CONTROL_PROCEDURE_TEMPLATE = `# Supplier Control Procedure

| Document Control | Value |
| --- | --- |
| **Document Number** | <SOP number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Next Review Date** | <next review date> |
| **Process Owner** | <process owner> |
| **Site / Business Unit** | <site name> |
| **Status** | Draft |
| **QMS Reference** | ISO 13485 §7.4 / 21 CFR 820.50 |

## 1. Purpose
This procedure establishes standardized, risk-based controls for selecting, classifying, qualifying, approving, monitoring, re-evaluating, and disqualifying suppliers of materials, components, sub-assemblies, and outsourced services that affect product quality, safety, or regulatory compliance at <company name>.

## 2. Scope
This procedure applies to all external providers supplying items or services that directly or indirectly impact finished product quality, regulatory submissions, or controlled manufacturing environments, including:
- Raw materials, active ingredients, excipients, sub-assemblies, and primary packaging components
- Contract manufacturers, contract sterilizers, and external packagers
- Calibration, analytical testing, environmental monitoring, and metrology laboratories
- Quality-impacting software, IT infrastructure, and GxP logistics providers

**Exclusions:** General facilities, office supplies, and administrative vendors that have no impact on product quality, controlled environments, or regulated records are excluded unless designated otherwise by Quality Assurance.

## 3. Regulatory & Quality System References
- ISO 13485:2016, Clause 7.4 (Purchasing) and Clause 4.1.5 (Outsourced Processes)
- 21 CFR Part 820.50 (Purchasing Controls) / QMSR alignment
- EU MDR 2017/745 Annex I & Annex II (where applicable to <product portfolio>)
- Internal QMS Procedures: <related QMS SOPs>

## 4. Roles & Responsibilities

| Function | Core Responsibilities |
| --- | --- |
| **Supply Chain / Purchasing** | Identify candidate suppliers, issue purchase orders containing approved purchasing data, maintain commercial records, and verify ASL status prior to PO release. |
| **Quality Assurance (QA)** | Own supplier risk classification, approve qualification packages, lead or approve supplier audits, authorize ASL additions/suspensions, and oversee SCAR closure. |
| **R&D / Engineering** | Define technical specifications, drawings, acceptance criteria, and first-article or sample evaluation requirements. |
| **Receiving / Incoming QC** | Execute incoming inspection per approved sampling plans, verify CoC/CoA completeness, and quarantine nonconforming receipts. |
| **Supplier Quality (SQE)** | Coordinate questionnaires, Quality Agreements, ongoing scorecard trending, and supplier remediation follow-up. |

## 5. Definitions & Acronyms

| Term | Definition |
| --- | --- |
| **ASL** | Approved Supplier List — controlled register of authorized suppliers and their approved supply scopes. |
| **Critical Supplier (Tier 1)** | A supplier whose failure could cause a serious product defect, patient or user harm, regulatory noncompliance, or extended supply interruption. |
| **CoA / CoC** | Certificate of Analysis / Certificate of Conformance certifying lot compliance against specifications. |
| **QAA** | Quality Assurance Agreement defining mutual quality, change-notification, audit, and record-retention obligations. |
| **SCAR** | Supplier Corrective Action Request issued to investigate and resolve supplier-attributable nonconformances. |

## 6. Supplier Lifecycle Procedure

### 6.1 Supplier Identification & Risk Classification
1. Engineering or Supply Chain initiates a new supplier request specifying the material, component, or service, applicable specification revision, and business justification.
2. QA and Engineering complete a Supplier Risk Classification (<risk form ref>) before qualification begins to assign Tier 1 (Critical), Tier 2 (Major), or Tier 3 (Minor).

### 6.2 Qualification & ASL Approval
1. SQE collects qualification evidence commensurate with the assigned tier (quality questionnaire, valid ISO 13485 / ISO 9001 / GMP certificates, audit report, sample / first-article inspection results, and executed QAA where required).
2. QA reviews the completed Vendor Qualification Report and grants **Approved** or **Conditional** status. No production purchase order may be released prior to ASL entry.

### 6.3 Purchasing Controls & Incoming Verification
1. Every purchase order must reference the approved part or service number, current drawing or specification revision, required CoC/CoA attributes, and applicable change-notification terms.
2. Receiving verifies supplier identity, lot traceability, shelf life, and CoC/CoA against the purchasing specification and records results in the Incoming Inspection Record. Nonconforming lots are placed in physical and electronic quarantine.

### 6.4 Ongoing Monitoring, Re-evaluation & SCARs
1. SQE tracks supplier quality metrics (lot acceptance rate, DPPM, on-time delivery, SCAR count, and audit status) on a <monitoring cadence> cadence.
2. Repeat nonconformances, critical incoming failures, or unapproved supplier changes trigger a formal SCAR with defined containment, root cause, corrective action, and effectiveness verification timelines.
3. QA conducts periodic re-evaluation (<review cadence>) to confirm continued suitability or adjust audit and inspection frequency.

### 6.5 Suspension & Disqualification
1. QA may immediately move a supplier to **Suspended** status upon critical quality failure, lapsed certification without mitigation, or overdue critical SCAR response.
2. Permanent **Disqualification** requires QA and Supply Chain approval, closure of open inventory impact assessments, and archival of the supplier file.

## 7. Control Matrix by Supplier Criticality

| Control Element | Tier 1 — Critical | Tier 2 — Major | Tier 3 — Minor |
| --- | --- | --- | --- |
| **Qualification Method** | Questionnaire, cert review, on-site audit, and sample qualification | Questionnaire, cert review, desktop/remote audit, and sample review | Certificate or capability verification and commercial review |
| **Quality Agreement** | Mandatory prior to ASL approval | Required for outsourced processes or custom parts | Not required unless specified by QA |
| **Audit Cadence** | Every <Tier 1 audit cycle> (on-site) | Every <Tier 2 audit cycle> (remote or on-site) | For-cause only |
| **Incoming Verification** | Lot-by-lot inspection + CoA/CoC verification | Skip-lot or reduced inspection + CoC/CoA | Receiving count, identity, and visual check |
| **Performance Review** | Semi-annual scorecard + annual QA review | Annual QA review | Periodic exception review |

## 8. Controlled Records & Retention

| Record | Form / Ref | Owning Function | Storage Location | Retention |
| --- | --- | --- | --- | --- |
| Approved Supplier List | <ASL doc ref> | QA / Supply Chain | <QMS repository> | <retention period> |
| Supplier Risk Classification | <SRC form ref> | QA | <QMS repository> | <retention period> |
| Vendor Qualification & Audit Reports | <VQR / SAR ref> | QA / SQE | <QMS repository> | <retention period> |
| Quality Agreements | <QAA form ref> | QA / Legal | <QMS repository> | <retention period> |
| Purchase Orders & Incoming Records | <ERP / IIR ref> | Supply Chain / QC | <ERP / QMS> | <retention period> |
| Supplier Corrective Action Requests | <SCAR form ref> | QA / SQE | <QMS repository> | <retention period> |

## 9. Approvals & Revision History

### 9.1 Document Approvals

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Author** | <author name> | <author role> | <status> | <date> |
| **Supply Chain Reviewer** | <SC reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

### 9.2 Revision History

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <author name> | Initial release of Supplier Control Procedure. |
`;

export const SUPPLIER_RISK_CLASSIFICATION_TEMPLATE = `# Supplier Risk Classification & Criticality Assessment

| Document Control | Value |
| --- | --- |
| **Assessment Number** | <assessment number> |
| **Revision** | <revision> |
| **Assessment Date** | <assessment date> |
| **Lead Assessor** | <assessor name> |
| **Supplier Legal Name** | <supplier name> |
| **Manufacturing Site** | <site location> |
| **Assessment Trigger** | <trigger type> (Initial / Periodic / Change / For-Cause) |
| **Governing SOP** | <supplier SOP ref> |

## 1. Purpose & Item Under Assessment
This assessment establishes the risk-based criticality tier for the supplier and purchased scope listed below. The resulting tier determines mandatory qualification evidence, audit cadence, Quality Agreement requirements, and incoming inspection controls.

| Attribute | Details |
| --- | --- |
| **Supplier Name & ERP Code** | <supplier name and code> |
| **Manufacturing / Service Site** | <site address> |
| **Material, Component, or Service** | <item or service scope> |
| **Part / Specification & Revision** | <part / spec rev> |
| **Affected Product Family** | <product family> |
| **Sourcing Redundancy** | <Sole / Dual / Multi> |
| **Existing Certifications** | <certifications & expiry> |

## 2. Scoring Criteria & Criticality Thresholds
Rate each factor from **1 (Lowest Risk)** to **5 (Highest Risk)** using objective product, regulatory, and historical evidence.

| Score | Quality / Safety Impact | Regulatory / Patient Risk | Supply Continuity | Process Complexity | Historical Performance |
| --- | --- | --- | --- | --- | --- |
| **1** | Cosmetic or non-product impact only | No regulatory filing or patient exposure | Commodity item; multiple off-the-shelf alternates | Standard catalog process | Proven supplier; zero SCARs in 24 months |
| **2** | Minor reworkable fit/finish impact | Indirect QMS record impact | Alternate qualified within 30 days | Conventional machining or packaging | Isolated minor observation; closed promptly |
| **3** | Functional defect caught by routine QC | Referenced in technical file / DHF | Re-qualification takes 1–6 months | Custom tooling or controlled environment | 1–2 minor SCARs or occasional late delivery |
| **4** | Major performance degradation or sterility risk | Direct impact on safety/efficacy or clearance | Sole-source with 6–12 month switch time | Special process (sterilization, coating, software) | Repeat nonconformance or Major audit finding |
| **5** | Patient harm, recall, or loss of essential performance | High-scrutiny notified body / FDA critical supplier | Single-source proprietary with 12+ month switch | Highly specialized or unverified outsourced process | Critical audit finding, unapproved change, or escalation |

**Overall Classification Thresholds:**
- **Critical (Tier 1):** Total weighted score ≥ 18, **or** any individual factor scored **5**, **or** outsourced sterilization / finished-device manufacturing.
- **Major (Tier 2):** Total weighted score between 11 and 17, with no factor scored 5.
- **Minor (Tier 3):** Total weighted score ≤ 10, with no factor above 3.

## 3. Criticality Evaluation Matrix

| Risk Factor | Weight | Score (1–5) | Weighted | Objective Rationale & Supporting Evidence |
| --- | --- | --- | --- | --- |
| **Quality / Safety Impact** | 1.5 | <quality score> | <wt. quality> | <DFMEA / CQA rationale> |
| **Regulatory / Patient Risk** | 1.5 | <reg score> | <wt. reg> | <filing / patient rationale> |
| **Supply Continuity / Sole-Source** | 1.0 | <supply score> | <wt. supply> | <lead time / alternate info> |
| **Process / Technical Complexity** | 1.0 | <process score> | <wt. process> | <special process rationale> |
| **Historical Performance** | 1.0 | <history score> | <wt. history> | <audit / SCAR history> |
| **Total Score** | — | — | **<total score>** | **Assigned Class:** <Critical / Major / Minor> |

## 4. Resulting Supplier Control Plan
Based on the assigned class (**<assigned class>**), the following controls apply before and after ASL listing:

| Control Requirement | Required Control | Verification Owner |
| --- | --- | --- |
| **Qualification Package** | <qualification scope> (Questionnaire / Audit / Samples) | <QA / SQE owner> |
| **Quality Agreement (QAA)** | <QAA requirement> (Mandatory / Conditional / N/A) | <QA / Legal owner> |
| **Audit Type & Frequency** | <audit type & cadence> | <Lead Auditor> |
| **Incoming Inspection & Certificates** | <inspection plan & certs> | <Incoming QC> |
| **Change Notification Window** | <notice window days> days written notice prior to change | <SQE / Purchasing> |
| **Performance Scorecard Review** | <review frequency> | <Supply Chain / QA> |

## 5. Risk Mitigations & Open Actions

| Action ID | Identified Risk or Gap | Mitigation Action | Owner | Target Date | Status |
| --- | --- | --- | --- | --- | --- |
| MIT-01 | <risk or gap 1> | <mitigation action 1> | <owner> | <target date> | Open |
| MIT-02 | <risk or gap 2> | <mitigation action 2> | <owner> | <target date> | Open |

## 6. Re-Assessment Triggers
This classification must be re-evaluated before the next scheduled review date if any of the following occur:
- Issuance of a Major or Critical SCAR, or more than <SCAR threshold> SCARs within 12 months
- Supplier relocation, ownership change, sub-tier outsourcing, or major manufacturing process change
- Lapse, suspension, or scope reduction of the supplier's ISO 13485 / GMP certification
- Expansion of the supplier's scope to a higher-risk product family or specification

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Assessor** | <assessor name> | <assessor role> | <status> | <date> |
| **Engineering Reviewer** | <eng reviewer> | <reviewer role> | <status> | <date> |
| **Supply Chain Reviewer** | <SC reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <assessment date> | <assessor name> | Initial supplier risk classification and control plan. |
`;

export const APPROVED_SUPPLIER_LIST_TEMPLATE = `# Approved Supplier List (ASL)

| Document Control | Value |
| --- | --- |
| **Document Number** | <ASL number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Next Periodic Review** | <next review date> |
| **Quality Owner** | <QA owner> |
| **Supply Chain Owner** | <SC owner> |
| **Site / Scope** | <site or business unit> |
| **Governing SOP** | <supplier SOP ref> |

## 1. Purpose & Purchasing Authorization Rule
This Approved Supplier List (ASL) is the controlled quality record identifying every external supplier authorized to provide materials, components, sub-assemblies, or quality-impacting services to <company name>.

**Purchasing Rule:** Purchase orders for controlled items or services may be issued **only** to suppliers listed below with an **Approved** or **Conditional** status, and strictly for the specific site, commodity scope, and specification revision listed.

## 2. Approval Status Definitions

| Status | Definition | PO Permitted? | Required QA Action |
| --- | --- | --- | --- |
| **Approved** | Full qualification completed with acceptable risk, audit, and sample verification. | Yes (unrestricted) | Routine monitoring and periodic re-evaluation. |
| **Conditional** | Provisional approval with explicit lot, quantity, or time restrictions pending open actions. | Yes (within limits) | Track conditions to expiry; convert to Approved or Suspend. |
| **Probation** | Active supplier under heightened oversight due to SCAR escalation or adverse trend. | Yes (enhanced QC) | Verify SCAR effectiveness before returning to Approved. |
| **Suspended** | Temporary purchasing freeze due to critical quality issue, unapproved change, or lapsed cert. | No | Quarantine affected WIP; QA clearance required to lift hold. |
| **Disqualified** | Permanently removed from authorized supply due to unresolved failure or business exit. | No | Retain historical record per QMS retention policy. |

## 3. Approved Supplier Register

| Supplier ID | Supplier Legal Name & Site | Approved Scope | Spec / Rev | Tier | Status | QAA Ref | Last / Next Audit | Restrictions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SUP-001 | <supplier 1 & site> | <scope 1> | <spec rev> | <tier> | <status> | <QAA ref> | <audit dates> | <restrictions> |
| SUP-002 | <supplier 2 & site> | <scope 2> | <spec rev> | <tier> | <status> | <QAA ref> | <audit dates> | <restrictions> |
| SUP-003 | <supplier 3 & site> | <scope 3> | <spec rev> | <tier> | <status> | <QAA ref> | <audit dates> | <restrictions> |

## 4. Conditional Approvals & Active Holds
Track every **Conditional**, **Probation**, or **Suspended** entry until resolved.

| Supplier ID | Supplier Name | Current Status | Condition / Restriction to Lift | Owner | Expiry Date |
| --- | --- | --- | --- | --- | --- |
| <supplier ID> | <supplier name> | <hold status> | <condition to lift> | <owner> | <expiry date> |

## 5. ASL Change Control Log
Record every addition, scope expansion, site transfer, status change, or removal reflected in this revision.

| Change Ref | Supplier ID & Name | Change Type | Qualification / SCAR Ref | Effective Date | QA Approver |
| --- | --- | --- | --- | --- | --- |
| <change ref> | <supplier ID & name> | <change type> | <VQR / SAR / SCAR ref> | <date> | <QA approver> |

## 6. Periodic Review Summary
Complete at each scheduled ASL review (<review frequency>):
- **Active Supplier Count:** <active count> (Critical: <tier 1 count>, Major: <tier 2 count>, Minor: <tier 3 count>)
- **Certification Audit Check:** Confirm ISO 13485 / ISO 9001 / GMP certificates are current for all active suppliers; flag expirations within 90 days.
- **Audit Schedule Compliance:** Confirm all scheduled on-site and remote audits are current or formally rescheduled with risk justification.
- **SCAR & Incoming Performance Review:** Summarize suppliers exceeding rejection or SCAR thresholds: <performance summary>.

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Prepared By** | <preparer name> | <preparer role> | <status> | <date> |
| **Supply Chain Approver** | <SC approver> | <approver role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <preparer name> | Initial controlled release of Approved Supplier List. |
`;
