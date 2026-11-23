/**
 * Complete, audit-ready TipTap templates for the first three Operations
 * documents in the demo gallery (converted via `markdownToDoc` with
 * `headingNodes: true`).
 */

export const PROCESS_FLOW_DIAGRAM_TEMPLATE = `# Manufacturing Process Flow Diagram & Step Definition

| Document Control | Value |
| --- | --- |
| **Document Number** | <PFD number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Product / Family** | <product family> |
| **Process Owner** | <process owner> |
| **Site / Production Line** | <site and line> |
| **Process Mode** | <process mode> (Batch / Continuous / Discrete) |
| **Cleanroom / Area Class** | <area classification> |

## 1. Purpose & Process Boundaries
This document defines the end-to-end manufacturing process flow, unit operations, inspection gates, material/utility inputs, and critical process steps for <product family> at <site and line>. It serves as the authoritative baseline for the Process FMEA (<PFMEA ref>), Control Plan, Equipment Qualification, and Process Validation.

- **Process Start Point:** <process start point> (e.g., incoming receipt and QC release)
- **Process End Point:** <process end point> (e.g., final packaging and QA batch release)
- **Typical Batch / Lot Size:** <standard lot size>

## 2. High-Level Process Sequence
1. **OP-010 — Incoming Receiving & Material Verification:** Verify CoC/CoA, ASL status, and quarantine release prior to kitting.
2. **OP-020 — Material Staging & Kitting:** Verify lot traceability, shelf life, and BOM reconciliation against the work order.
3. **OP-030 — Primary Manufacturing / Sub-Assembly:** Execute core fabrication, compounding, or assembly operations under controlled parameters.
4. **OP-040 — In-Process Testing & Verification:** Perform mandatory in-process inspections and functional checks prior to packaging.
5. **OP-050 — Primary & Secondary Packaging / Labeling:** Package, seal, print/verify UDI and lot labels, and perform label reconciliation.
6. **OP-060 — Final Inspection & QA Release:** Review Device History Record / Batch Record, release product to finished goods, or segregate holds.

## 3. Detailed Step-by-Step Process Flow

| Step No. | Operation / Station | Type | Equipment ID | Key Inputs | Critical Parameters (CPP) | In-Process Controls | Critical? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OP-010 | Incoming Receiving & QC | Inspect | <gauges / ERP> | Purchased parts, CoC/CoA | N/A (verification gate) | Released lots; IIR record | No |
| OP-020 | Kitting & Line Clearance | Prep | <staging / scales> | Approved BOM, work order | Line clearance check | Verified kit; batch record | No |
| OP-030 | <core mfg step> | Operation | <equipment ID> | <core materials> | <critical parameters> | <in-process check> | Yes |
| OP-040 | <in-process test> | Inspect | <test fixture ID> | Assembled units | <test limits & cal.> | Pass/Fail log; auto-reject | Yes |
| OP-050 | Packaging & Labeling | Operation | <sealer / printer> | Pouches, UDI labels, IFU | <seal temp / dwell> | Seal check; 100% scan | Yes |
| OP-060 | Final QA Review & Release | Inspect | <QMS / ERP> | Completed DHR / BMR | Record completeness | Released finished lot | Yes |

## 4. Material, Utility & Waste Map

| Stream Category | Specific Items | Source / Quality Grade | Point of Use | Handling / Disposal Control |
| --- | --- | --- | --- | --- |
| **Direct Materials** | <raw materials & parts> | ASL-approved suppliers | OP-020 to OP-050 | Lot-tracked in ERP / DHR |
| **Process Utilities** | <process utilities> | Qualified facility systems | OP-030 to OP-050 | Routine environmental & utility monitoring |
| **Consumables & Aids** | <consumables & solvents> | Qualified vendors | OP-030 | Controlled cleaning / residue removal |
| **Waste & Rejects** | <scrap & rejected labels> | Rejected at OP-030 to OP-060 | Red-bin quarantine | Accounted for in yield reconciliation |

## 5. Critical Process Steps & Downstream Validation Linkage
The steps marked **Critical = Yes** above directly impact Critical Quality Attributes (CQAs) and require the following downstream controls:
- **PFMEA Coverage:** Every critical step (OP-030, OP-040, OP-050, OP-060) must have corresponding failure-mode entries in <PFMEA ref>.
- **Equipment & Test Method Qualification:** Equipment used at critical steps must maintain current IQ/OQ/PQ and calibration status; test fixtures must complete TMV.
- **Process Characterisation & Validation:** Critical process parameters must have established proven acceptable ranges prior to Process Validation (<PV ref>).

## 6. Rework, Hold & Nonconforming Material Handling
- Any unit failing an in-process inspection at OP-030–OP-050 is immediately segregated into a labeled quarantine container and logged under an NCR.
- Rework is permitted **only** under an approved rework procedure (<rework SOP ref>) with documented re-inspection through all affected verification gates.

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Author** | <process owner> | <owner role> | <status> | <date> |
| **Manufacturing Eng.** | <mfg lead> | <lead role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <process owner> | Initial release of Manufacturing Process Flow Diagram. |
`;

export const EQUIPMENT_QUALIFICATION_PLAN_TEMPLATE = `# Equipment Qualification Plan (IQ / OQ / PQ)

| Document Control | Value |
| --- | --- |
| **Document Number** | <plan number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Equipment Name** | <equipment name> |
| **Asset / Equipment ID** | <asset ID> |
| **Installed Location** | <building / room / line> |
| **System Owner** | <system owner> |
| **Impact Classification** | <impact class> (Direct / Indirect) |

## 1. Purpose & Equipment Identification
This Equipment Qualification Plan defines the strategy, responsibilities, prerequisites, protocol scope, deliverables, and acceptance criteria required to qualify **<equipment name>** (**<asset ID>**) for GxP manufacturing or laboratory use in accordance with EU GMP Annex 15, 21 CFR 820.70(g), and <VMP document ref>.

| Equipment Attribute | Specification |
| --- | --- |
| **Equipment Name & Asset ID** | <equipment name> / <asset ID> |
| **Manufacturer & Model** | <manufacturer & model> |
| **Serial Number** | <serial number> |
| **Intended Process Use** | <intended process use> |
| **Software / GAMP Category** | <SW version & GAMP cat.> |
| **Required Utilities** | <required utilities> |
| **Parent URS Reference** | <equipment URS ref> |

## 2. Roles & Responsibilities

| Role | Representative | Qualification Responsibilities |
| --- | --- | --- |
| **System Owner / Engineering** | <system owner> | Ensure installation readiness, utilities, vendor manuals, SOPs, and PM setup. |
| **Validation Lead** | <validation lead> | Author IQ/OQ/PQ protocols, coordinate execution, manage deviations, and issue the Qualification Report. |
| **Quality Assurance (QA)** | <QA representative> | Review and approve protocols, deviations, risk assessments, and final equipment release. |
| **Metrology / Calibration** | <metrology lead> | Verify NIST-traceable calibration of all critical instruments before OQ execution. |
| **Operations / End Users** | <operations lead> | Support PQ runs using draft operating procedures and verify ergonomic/HMI usability. |

## 3. Pre-Qualification Prerequisites
All prerequisites below must be verified complete before protocol execution begins:
- Approved Equipment User Requirements Specification (<equipment URS ref>) and System Risk Assessment
- Completed Factory Acceptance Test (FAT) and/or Site Acceptance Test (SAT) with all critical punch-list items closed
- Approved engineering drawings (P&ID, electrical schematics, layout) and vendor O&M manuals available on site
- Environmental, Health & Safety (EHS) installation sign-off completed
- Draft operating, cleaning, and preventive maintenance SOPs initiated

## 4. Qualification Strategy & Protocol Scope

### 4.1 Installation Qualification (IQ)
Verify and document that the equipment and all supporting utilities are installed per approved design specifications and manufacturer recommendations:
- Physical asset verification (model, serial number, major sub-components, materials of construction)
- Utility hookup verification (voltage, phase, pressure, flow, exhaust, network/data connections)
- Critical instrument identification and initial calibration verification
- Software/firmware version installation check and baseline backup verification
- Verification of spare parts list, preventive maintenance enrollment, and vendor documentation package

### 4.2 Operational Qualification (OQ)
Challenge the equipment across its full specified operating envelope without relying on routine production output alone:
- Control logic, HMI navigation, recipe security, user access levels, and 21 CFR Part 11 audit-trail verification (where applicable)
- Operating range challenges at low, nominal, and high set-points for <critical parameters>
- Safety interlocks, limit switches, alarm triggers, and power-loss / recovery behavior
- Reproducibility and stability verification over defined run durations

### 4.3 Performance Qualification (PQ)
Demonstrate consistent performance under normal and worst-case routine operating conditions using approved materials and draft SOPs:
- Execute a minimum of **<PQ run count>** (typically 3) consecutive, independent runs covering <worst-case load>
- Collect in-process and finished output samples per the defined sampling plan and test against specification limits
- Confirm operator workflow, cycle time, and batch documentation meet operational requirements

## 5. Qualification Deliverables & Schedule

| Deliverable | Document / Protocol ID | Owner | Prerequisite | Target Date | Status |
| --- | --- | --- | --- | --- | --- |
| System Risk Assessment & URS | <URS / RA ref> | <system owner> | Approved purchase spec | <date> | <status> |
| IQ Protocol & Execution | <IQ protocol ID> | <validation lead> | Site installation & EHS | <date> | Planned |
| OQ Protocol & Execution | <OQ protocol ID> | <validation lead> | IQ approved & calibrated | <date> | Planned |
| PQ Protocol & Execution | <PQ protocol ID> | <validation lead> | OQ approved & draft SOPs | <date> | Planned |
| Equipment Qualification Report | <EQR doc ID> | <validation lead> | IQ/OQ/PQ closed | <date> | Planned |

## 6. Deviation Handling & Final Acceptance Criteria
- Any test result failing an acceptance criterion or deviating from the written protocol is logged as a Qualification Deviation (<deviation SOP ref>), evaluated by Validation and QA, and dispositioned prior to phase closure.
- **Release Criteria:** The equipment is eligible for routine release only when IQ, OQ, and PQ protocols are 100% executed, all critical/major deviations are closed, operating/PM/calibration SOPs are effective, and QA approves the Equipment Qualification Summary Report.

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Validation Lead** | <validation lead> | <lead role> | <status> | <date> |
| **System Owner** | <system owner> | <owner role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <validation lead> | Initial release of Equipment Qualification Plan. |
`;

export const EQUIPMENT_QUALIFICATION_REPORT_TEMPLATE = `# Equipment Qualification Summary Report (IQ / OQ / PQ)

| Document Control | Value |
| --- | --- |
| **Report Number** | <report number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Equipment Name** | <equipment name> |
| **Asset / Equipment ID** | <asset ID> |
| **Qualification Plan Ref** | <EQP document ref> |
| **Validation Lead** | <validation lead> |
| **Qualification Status** | <qualification status> (Qualified / Conditional / Not Qualified) |

## 1. Executive Summary & Qualified Status
This summary report consolidates the executed Installation Qualification (IQ), Operational Qualification (OQ), and Performance Qualification (PQ) activities for **<equipment name>** (**<asset ID>**) per <EQP document ref>.

**Qualification Determination:** Based on the objective evidence summarized in Sections 3 through 6, **<equipment name>** (**<asset ID>**) is **<qualification status>** for routine GxP operation within the approved operating window defined in Section 4.

## 2. Equipment Identity & Qualified Baseline Configuration

| Attribute | Verified Baseline Value |
| --- | --- |
| **Equipment Name & Asset ID** | <equipment name> / <asset ID> |
| **Manufacturer & Model** | <manufacturer & model> |
| **Serial Number** | <serial number> |
| **Installed Location** | <building / room / line> |
| **Software / Firmware Version** | <verified SW version> |
| **Calibration Status & Due Date** | <calibration status & due> |
| **CMMS / PM Asset Record** | <CMMS asset & PM ref> |

## 3. IQ / OQ / PQ Execution Summary

| Phase | Protocol ID & Rev | Execution Dates | Cases Run | Pass / Fail | Deviations | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| **IQ** | <IQ protocol & rev> | <IQ dates> | <IQ count> | <IQ pass/fail> | <IQ devs> | <IQ disposition> |
| **OQ** | <OQ protocol & rev> | <OQ dates> | <OQ count> | <OQ pass/fail> | <OQ devs> | <OQ disposition> |
| **PQ** | <PQ protocol & rev> | <PQ dates> | <PQ count> | <PQ pass/fail> | <PQ devs> | <PQ disposition> |

## 4. Key Qualification Results & Approved Operating Window

| Parameter / Challenge | Tested Range | Acceptance Criteria | Observed Result | Approved Range |
| --- | --- | --- | --- | --- |
| <critical parameter 1> | <tested range 1> | <spec limit 1> | <observed result 1> | <approved range 1> |
| <critical parameter 2> | <tested range 2> | <spec limit 2> | <observed result 2> | <approved range 2> |
| **Alarms, Interlocks & Security** | All alarms, e-stops, roles | 100% trigger & audit trail | <alarms summary> | Verified baseline |
| **PQ Consecutive Runs** | <PQ runs & load> | All CQAs within spec | <PQ CQA summary> | Approved for <product family> |

## 5. Deviations, Exceptions & Impact Assessment
Record all deviations or test discrepancies encountered during execution (enter "None" if zero deviations occurred).

| Deviation ID | Phase / Case | Summary of Discrepancy | Root Cause & Impact | Resolution / Retest | Status |
| --- | --- | --- | --- | --- | --- |
| <DEV-01 or None> | <phase / case> | <discrepancy summary> | <root cause & impact> | <retest / resolution> | <status> |

## 6. Operational Handover & Lifecycle Controls
Confirm all ongoing operational controls are active prior to releasing the equipment from qualification hold:

| Lifecycle Control | Reference Document / System | Verified Status | Owner |
| --- | --- | --- | --- |
| **Operating & Cleaning SOPs** | <SOP numbers & revs> | <Effective / Pending> | <operations owner> |
| **Preventive Maintenance (PM)** | <CMMS PM schedule ID> | <Active / Pending> | <engineering owner> |
| **Calibration Schedule** | <calibration plan ID> | <Active / Pending> | <metrology owner> |
| **Operator Training** | <LMS curriculum ref> | <Complete / Pending> | <training owner> |
| **Periodic Re-Qualification** | <PRQ cycle> | Next PRQ: <next PRQ date> | <validation owner> |

## 7. Conclusion & Release Approval
All acceptance criteria defined in <EQP document ref> have been **<criteria outcome>** (met / met with noted conditions). Any future hardware, software, utility, or operating-range modification requires evaluation under Change Control (<change control SOP ref>).

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Validation Lead** | <validation lead> | <lead role> | <status> | <date> |
| **System Owner** | <system owner> | <owner role> | <status> | <date> |
| **Operations Approver** | <operations approver> | <approver role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <validation lead> | Initial release of Equipment Qualification Summary Report. |
`;
