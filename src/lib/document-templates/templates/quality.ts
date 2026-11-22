/**
 * Complete, audit-ready TipTap templates for the generic Quality documents
 * (`capa` and `change-control`; `deviations` is already the structured
 * `investigation_report` type).
 */

export const CAPA_TEMPLATE = `# Corrective and Preventive Action (CAPA)

| Document Control | Value |
| --- | --- |
| **CAPA Number** | <CAPA number> |
| **Initiation Date** | <initiation date> |
| **CAPA Owner** | <CAPA owner> |
| **Department / Site** | <department & site> |
| **Trigger Type** | <trigger type> (Deviation / Audit / Complaint / OOS / SCAR) |
| **Originating Record Ref** | <originating record ID> |
| **Risk Priority** | <Critical / Major / Minor> |
| **Target Closure Date** | <target closure date> |

## 1. Problem Description & Initiation
Provide an objective, factual statement of the nonconformance or systemic trend that initiated this CAPA (avoid premature root-cause conclusions).

- **Event / Trend Summary** (what happened, where, when detected, and frequency): <event summary>
- **Affected Products, Lots & Processes** (part numbers, lot/batch numbers, or QMS processes): <affected scope>
- **Regulatory & Reportability Screen** (MDR/vigilance, FSCA, or recall assessment): <reportability result>

## 2. Immediate Containment & Initial Risk Assessment

### 2.1 Containment Actions

| Containment ID | Immediate Action Taken | Affected Scope | Owner | Completion Date | Verification Evidence |
| --- | --- | --- | --- | --- | --- |
| CONT-01 | <containment action 1> | <lots / WIP / sites> | <owner> | <date> | <evidence ref> |
| CONT-02 | <containment action 2> | <affected scope> | <owner> | <date> | <evidence ref> |

### 2.2 Initial Risk Assessment
- **Severity / Patient or Quality Impact** (reference Risk File): <severity & rationale>
- **Occurrence / Recurrence Trend** (isolated vs. recurring across lots or time): <occurrence trend>
- **Detectability by Existing Controls** (ability of current QC checks to catch recurrence): <detectability>

## 3. Root Cause Investigation

### 3.1 Investigation Method & Team
- **Cross-Functional Team:** <team & departments>
- **Methodology Applied:** <method> (5-Why / Fishbone 6M / Fault Tree / Is–Is Not)

### 3.2 Objective Evidence Reviewed
Summarize batch records, audit trails, equipment logs, supplier records, complaint history, and test data examined during the investigation: <evidence summary>.

### 3.3 Identified Root Cause(s) & Contributing Factors
- **Primary Root Cause** (verified systemic cause supported by evidence): <primary root cause>
- **Contributing Factor(s)** (secondary process, design, training, or supplier factors): <contributing factors>
- **Systemic Read-Across** (impact across other products, lines, sites, or suppliers): <read-across result>

## 4. Corrective & Preventive Action Plan
Every root cause and systemic read-across finding must link to a specific, owned action with measurable completion evidence.

| Action ID | Type | Action Description | Linked Cause | Owner | Target Date | Deliverable | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CA-01 | Corrective | <corrective action 1> | Primary Root Cause | <owner> | <target date> | <deliverable ref> | Open |
| CA-02 | Corrective | <corrective action 2> | Contributing Factor | <owner> | <target date> | <deliverable ref> | Open |
| PA-01 | Preventive | <preventive action 1> | Read-Across | <owner> | <target date> | <deliverable ref> | Open |

## 5. Implementation Verification & Documentation Updates
Confirm completion of all planned actions and verify that downstream controlled records have been updated:
- **Action Completion Check:** All actions (CA-01, CA-02, PA-01) verified complete with objective evidence archived in <evidence repository>.
- **Risk File / FMEA Update** (PFMEA / DFMEA / Risk Management File ref or N/A rationale): <risk file update ref>.
- **Training & Communication** (affected personnel trained under updated SOPs; LMS record ref): <training record ref>.

## 6. Effectiveness Verification Plan & Results
Define objective, risk-appropriate criteria **before** implementation is closed to confirm that the actions eliminated recurrence without introducing adverse side effects.

| Verification Method / Metric | Acceptance Criteria | Sample / Window | Owner | Observed Result | Determination |
| --- | --- | --- | --- | --- | --- |
| <verification metric> | <acceptance criteria> | <sample / window> | <QA owner> | <observed data> | <Effective / Open> |

## 7. CAPA Closure & Approvals
- **Closure Readiness:** All corrective and preventive actions implemented, documentation and Risk File updated, and effectiveness verification criteria met (**<Yes / No>**).

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **CAPA Owner** | <CAPA owner> | <owner role> | <status> | <date> |
| **Department Approver** | <dept approver> | <approver role> | <status> | <date> |
| **QA Approver (Plan)** | <QA plan approver> | <QA role> | <status> | <date> |
| **QA Approver (Closure)** | <QA closure approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <initiation date> | <CAPA owner> | Initial CAPA initiation and action plan. |
`;

export const CHANGE_CONTROL_TEMPLATE = `# Change Control Request & Assessment

| Document Control | Value |
| --- | --- |
| **Change Control Number** | <change control no.> |
| **Initiation Date** | <initiation date> |
| **Change Owner** | <change owner> |
| **Department / Site** | <department & site> |
| **Change Category** | <change category> (Product / Process / Doc / Supplier / Equipment / SW) |
| **Change Classification** | <Major / Minor / Admin> |
| **Trigger / Reference** | <trigger reference> (CAPA / ECO / Audit / Improvement) |
| **Target Effective Date** | <target effective date> |

## 1. Change Summary & Justification
- **Title & Summary of Change:** <change summary>
- **Business & Quality Justification** (why needed, expected benefits, risk of not implementing): <change justification>
- **Affected Products, Processes & Sites:** <affected items & sites>

## 2. Current State vs. Proposed State

| Element / Document Reference | Current Approved State | Proposed Future State | Supporting Ref |
| --- | --- | --- | --- |
| <element or SOP 1> | <current state 1> | <proposed state 1> | <drawing / SOP rev> |
| <element or SOP 2> | <current state 2> | <proposed state 2> | <drawing / SOP rev> |

## 3. Cross-Functional Impact Assessment
Every functional area below must be explicitly evaluated (**Yes** or **No**) with documented rationale.

| Functional Area | Impact? | Assessment & Rationale | Required Deliverable | Reviewer |
| --- | --- | --- | --- | --- |
| **Quality System & Docs** | <Yes / No> | <QMS / SOP impact> | <doc updates> | <QA reviewer> |
| **Design, DHF & Risk File** | <Yes / No> | <DHF / ISO 14971 impact> | <risk / DHF update> | <R&D reviewer> |
| **Regulatory, Labeling & UDI** | <Yes / No> | <filing / label impact> | <regulatory memo> | <RA reviewer> |
| **Process, Equip. & TMV** | <Yes / No> | <IQ/OQ/PQ / PV impact> | <validation protocol> | <Val. reviewer> |
| **Suppliers & ASL** | <Yes / No> | <supplier / QAA impact> | <supplier action> | <SC reviewer> |
| **Inventory, WIP & Cutover** | <Yes / No> | <lot cutover / scrap rule> | <cutover plan> | <Ops reviewer> |
| **Stability & Packaging** | <Yes / No> | <shelf life / sterile impact> | <aging / test ref> | <QC reviewer> |
| **Training & Competency** | <Yes / No> | <retraining impact> | <LMS assignment> | <Training owner> |

## 4. Change Classification & Approval Determination
- **Assigned Classification:** **<Major / Minor / Admin>**
- **Classification Rationale** (based on product safety, efficacy, validation state, and filing impact): <classification rationale>
- **Implementation Gate:** No production, purchasing, or document cutover may occur until Pre-Implementation Approvals in Section 6.1 are complete.

## 5. Implementation & Cutover Plan

| Task ID | Implementation Task | Owner | Target Date | Completion Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| IMP-01 | <revise specs / SOPs> | <owner> | <target date> | <approved doc rev> | Open |
| IMP-02 | <verification / qualification> | <owner> | <target date> | <report ref> | Open |
| IMP-03 | <training & ERP cutover> | <owner> | <target date> | <LMS / ERP ref> | Open |

## 6. Post-Implementation Verification & Approvals

### 6.1 Pre-Implementation Approval (Authorization to Execute)

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Change Owner** | <change owner> | <owner role> | <status> | <date> |
| **Technical Reviewer** | <technical reviewer> | <reviewer role> | <status> | <date> |
| **Regulatory Affairs** | <RA reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

### 6.2 Post-Implementation Verification & Close-Out
- **Verification Summary:** All implementation tasks (IMP-01–IMP-03), controlled document releases, training records, and cutover actions are complete and verified (**<Yes / No>**).
- **Effective Lot / Date:** <effective lot / date>
- **QA Final Closure Sign-Off:** <QA closure approver>, Date: <closure date>

### 6.3 Revision History

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <initiation date> | <change owner> | Initial Change Control Request and impact assessment. |
`;
