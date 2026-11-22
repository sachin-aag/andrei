/**
 * Complete, audit-ready TipTap templates for the first three Design documents
 * in the demo gallery (converted via `markdownToDoc` with `headingNodes: true`).
 */

export const USER_REQUIREMENTS_TEMPLATE = `# User Requirements Specification (URS)

| Document Control | Value |
| --- | --- |
| **Document Number** | <URS number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Product / System Name** | <product name> |
| **Product Family / Model** | <product family> |
| **Author** | <author name> |
| **Regulatory Classification** | <regulatory class> |
| **Design Phase** | <design phase> (Concept / Feasibility / Design Input) |

## 1. Purpose & Intended Use

### 1.1 Purpose
This User Requirements Specification (URS) defines the intended use, user profile, operating environment, clinical/operational needs, and high-level regulatory constraints for <product name>. Every user need in this document serves as a traceable parent input to the Design Specification and the Design Validation Protocol.

### 1.2 Intended Use & Indications for Use
<product name> is intended to <intended clinical function> for <target population>. It is designed to be operated by <intended users> in <care or facility setting>.

### 1.3 Contraindications & Limitations
- **Contraindications:** <contraindications>
- **Out-of-Scope Uses:** <excluded uses>

### 1.4 Intended Users & Training Profile
- **Primary Users:** <primary user roles>
- **Minimum Qualifications & Training:** <training requirements>
- **Service / Maintenance Users:** <service user roles>

## 2. Operating, Storage & Transport Environment

| Environmental Condition | Requirement / Expected Range | Reference Standard |
| --- | --- | --- |
| **Operating Setting** | <operating setting> | <facility / IEC standard> |
| **Operating Temp & Humidity** | <temp & % RH range> | Non-condensing |
| **Storage & Transport** | <storage & transport limits> | <ISTA 3A / ASTM D4169> |
| **Utilities & Infrastructure** | <power / gas / network> | <utility spec> |
| **Service Life / Shelf Life** | <service or shelf life> | <aging basis> |

## 3. User Needs & Functional Requirements
Each user need carries a unique identifier (UN-xxx), priority (**Must** = mandatory for release; **Should** = desired if feasible), and validation basis.

| Need ID | Category | User Need Statement | Priority | Validation Basis | Spec Trace |
| --- | --- | --- | --- | --- | --- |
| UN-001 | Clinical / Functional | The system shall enable the user to <core workflow outcome> within <target cycle or accuracy>. | Must | Simulated-use clinical validation | <SPEC ID> |
| UN-002 | Usability / HF | The user shall set up, operate, and interpret status without critical use errors after <training expectation>. | Must | Summative human factors study (IEC 62366) | <SPEC ID> |
| UN-003 | Safety & Alarms | The system shall alert the user immediately upon <fault condition> and transition to a safe state. | Must | Risk control verification & validation | <SPEC ID> |
| UN-004 | Cleaning / Sterility | Patient-contact or reusable surfaces shall withstand <reprocessing method> for <cycle count>. | Must | Reprocessing / sterilization validation | <SPEC ID> |
| UN-005 | Packaging & Labeling | Packaging shall protect product through distribution and display UDI, lot/serial, expiry, and storage symbols. | Must | Distribution & labeling inspection | <SPEC ID> |

## 4. Safety, Essential Performance & Risk Inputs
- **Essential Performance:** <essential performance> (functions whose loss causes unacceptable clinical risk)
- **Primary Hazard Categories:** <hazard categories> (mechanical, electrical, thermal, biological, cybersecurity, use-error)
- **Biocompatibility / Sterility:** <bio / sterility spec> (patient contact duration, ISO 10993, SAL)
- **Risk Management Link:** All user-facing hazards feed into the Risk Management Plan (<RMP ref>) and DFMEA (<DFMEA ref>).

## 5. Regulatory, Standards & Labeling Requirements

| Standard / Regulation | Applicability to Product | Key Deliverable |
| --- | --- | --- |
| **21 CFR Part 820 / ISO 13485** | Design controls and DHF compliance | Design Plan, Traceability Matrix, DHF |
| **ISO 14971:2019** | Risk management throughout product lifecycle | Risk Management File & Residual Risk Report |
| **IEC 62366-1** | Usability engineering for medical devices | Formative & Summative Human Factors File |
| **<applicable standard>** | <standard applicability> (IEC 60601 / 62304 / ISO 10993) | <test report deliverable> |
| **Labeling & UDI** | <UDI / IFU regions> (FDA UDI / EU MDR Annex I Ch. III) | Approved Labels, IFU, and Packaging Artwork |

## 6. Traceability & Design Validation Strategy
1. Every **Must** requirement (UN-001 onward) must map to at least one quantitative requirement in the Design Specification (<design spec ref>).
2. Design Validation (<design validation ref>) will confirm under actual or simulated use conditions that the finished, production-equivalent product fulfills every user need documented in this URS.

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Author / Product Manager** | <author name> | <author role> | <status> | <date> |
| **Clinical / Medical Affairs** | <clinical reviewer> | <reviewer role> | <status> | <date> |
| **R&D / Systems Engineering** | <eng reviewer> | <reviewer role> | <status> | <date> |
| **Quality / Regulatory** | <QA / RA approver> | <approver role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <author name> | Initial release of User Requirements Specification. |
`;

export const DESIGN_SPECS_TEMPLATE = `# Design Specification

| Document Control | Value |
| --- | --- |
| **Document Number** | <spec number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Product / Subsystem** | <product / subsystem> |
| **Parent URS Reference** | <URS doc ref & rev> |
| **Risk File Reference** | <DFMEA / RMP ref> |
| **Author** | <author name> |
| **Design Phase** | <design phase> (Design Input / Design Output / Freeze) |

## 1. Purpose & System Scope
This Design Specification translates user needs from <URS doc ref & rev> and risk control measures from <DFMEA / RMP ref> into unambiguous, verifiable engineering requirements for <product / subsystem>.

- **Configurations / SKUs Covered:** <SKUs or variants>
- **Top-Level Assembly / BOM:** <top-level drawing / BOM>
- **Applicable Design Controls:** 21 CFR 820.30(c)–(d) and ISO 13485 §7.3.3–§7.3.4

## 2. System-Level Specifications
Every specification item must be measurable, carry an explicit tolerance or pass/fail limit, and map to a defined verification method.

| Spec ID | Parameter / Requirement | Nominal / Target | Tolerance / Limit | Verification Method | URS / Risk Trace |
| --- | --- | --- | --- | --- | --- |
| SYS-001 | <performance parameter> | <nominal & unit> | <tolerance limit> | <DTM ID / Analysis> | UN-001 |
| SYS-002 | <dimensional / mass spec> | <nominal dim / mass> | <tolerance limit> | Dimensional inspection | UN-001 |
| SYS-003 | <safety / alarm threshold> | <target threshold> | <response limit> | Functional safety test | UN-003 / <RC ID> |
| SYS-004 | <durability / shelf life> | <cycles or months> | Zero functional failures | Environmental / life test | UN-004 |
| SYS-005 | <power / thermal / EMC> | <target rating> | Compliant with <standard> | Certified lab test report | UN-003 |

## 3. Subsystem & Component Specifications

### 3.1 Mechanical & Materials
Structural, dimensional, surface-finish, and patient-contact material requirements (biocompatibility grades and sterilization compatibility): <mechanical / material spec>.

### 3.2 Electrical, Power & Firmware / Software
Power supply architecture, electrical safety isolation, firmware baseline, cybersecurity controls, and data integrity: <electrical / SW spec>.

### 3.3 Packaging, Labeling & Sterilization
Sterile barrier or protective packaging configuration, label durability, UDI carrier format, and IFU inclusion: <packaging / label spec>.

### 3.4 Major Component Index

| Comp ID | Component / Assembly | Drawing / Part No. | Rev | Material / Standard | CTQ Attributes |
| --- | --- | --- | --- | --- | --- |
| CMP-001 | <component 1 name> | <part / drawing no.> | <rev> | <material / std> | <CTQ tolerances> |
| CMP-002 | <component 2 name> | <part / drawing no.> | <rev> | <material / std> | <CTQ tolerances> |
| CMP-003 | <component 3 name> | <part / drawing no.> | <rev> | <material / std> | <CTQ tolerances> |

## 4. Interface Requirements

| Interface ID | Interface Type | Connected Elements | Specification & Tolerance | Verification Method |
| --- | --- | --- | --- | --- |
| INT-001 | Mechanical | <subsystem A to B> | <fit / retention spec> | <fit / pull method> |
| INT-002 | Electrical / Power | <power to controller> | <voltage / pinout / ESD> | <electrical method> |
| INT-003 | Fluidic / Pneumatic | <port / tubing link> | <ISO 80369 / leak rate> | <pressure / leak test> |
| INT-004 | Software / Data / UI | <firmware to HMI> | <protocol / latency> | <SW integration test> |

## 5. Verification Acceptance Criteria & Sampling Rationale
- **Statistical Basis:** Design Verification testing (<DVR ref>) shall verify critical specifications using <confidence / reliability> (e.g., 95% confidence / 95% reliability) or pre-defined variable tolerance intervals.
- **Allowed Failures:** Unless explicitly justified by risk level and approved in the Design Verification Plan, zero failures are permitted for safety-critical or essential-performance specifications. Failure allowance policy: <failure allowance policy>.
- **Test Method Readiness:** All custom test methods listed above must complete Test Method Validation (TMV) prior to formal Design Verification execution.

## 6. Requirements Traceability Matrix (Summary)

| URS ID | Design Spec ID | Risk Control ID | Verification Method | DV Protocol / Report | Status |
| --- | --- | --- | --- | --- | --- |
| UN-001 | SYS-001, SYS-002 | <RC ID or N/A> | <DTM ID> | <DVR ref> | <Draft / Verified> |
| UN-003 | SYS-003, SYS-005 | <RC ID> | <DTM ID> | <DVR ref> | <Draft / Verified> |
| UN-004 | SYS-004 | <RC ID or N/A> | <DTM ID> | <DVR ref> | <Draft / Verified> |

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **Author** | <author name> | <author role> | <status> | <date> |
| **Systems / R&D Lead** | <systems lead> | <lead role> | <status> | <date> |
| **Manufacturing Eng.** | <mfg reviewer> | <reviewer role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <author name> | Initial baseline Design Specification. |
`;

export const DFMEA_TEMPLATE = `# Design Failure Mode and Effects Analysis (DFMEA)

| Document Control | Value |
| --- | --- |
| **Document Number** | <DFMEA number> |
| **Revision** | <revision> |
| **Effective Date** | <effective date> |
| **Product / Assembly** | <product / assembly> |
| **Design Revision** | <design revision> |
| **Risk Management Plan** | <RMP document ref> |
| **FMEA Facilitator** | <facilitator name> |
| **Governing Standard** | ISO 14971:2019 / AIAG-VDA |

## 1. Purpose, Scope & System Boundaries
This Design Failure Mode and Effects Analysis (DFMEA) systematically identifies potential design failure modes, evaluates their clinical, operational, and quality effects, prioritizes risk controls, and documents residual risk for <product / assembly> (Revision <design revision>).

- **Subsystems Included:** <subsystems in scope> (mechanical, electrical, firmware, disposable, packaging)
- **Lifecycle Phases Considered:** Storage and transport, setup, normal clinical/operational use, cleaning/reprocessing, servicing, and end-of-life disposal.
- **Explicit Exclusions / Interfaces:** <exclusions / interfaces> (e.g., manufacturing-only failure modes in PFMEA)

## 2. Cross-Functional Review Team

| Name | Function / Discipline | Contribution |
| --- | --- | --- |
| <lead engineer> | R&D / Mechanical Engineering | Design architecture, materials, and tolerances |
| <EE / SW lead> | Electrical / Software Engineering | Electronics, firmware fault handling, and alarms |
| <clinical / QA lead> | Clinical / Regulatory / QA | Harm severity alignment and ISO 14971 acceptability |
| <mfg engineer> | Manufacturing Engineering | Design-for-manufacture and control handoff to PFMEA |

## 3. Rating Scales & Risk Acceptability Criteria
All failure modes are scored on standardized 1–5 scales aligned to <RMP document ref>. **RPN = Severity (S) × Occurrence (O) × Detectability (D)** (range: 1–125).

| Rating | Severity (S) | Occurrence (O) | Detectability (D) |
| --- | --- | --- | --- |
| **1** | Negligible — no injury or functional loss | Improbable (less than 1 in 1,000,000) | Certain — automated design interlock prevents failure |
| **2** | Minor — temporary inconvenience or cosmetic defect | Remote (1 in 100,000 to 1,000,000) | High — verified automated test or clear pre-use check |
| **3** | Moderate — reversible minor injury or delayed procedure | Occasional (1 in 10,000 to 100,000) | Moderate — detectable during routine inspection or use |
| **4** | Serious — permanent impairment or medical intervention | Probable (1 in 1,000 to 10,000) | Low — difficult to detect prior to clinical use |
| **5** | Catastrophic — death or life-threatening injury | Frequent (greater than 1 in 1,000) | Undetectable — no current design or test control detects |

**Action Thresholds:**
- **High Risk (Unacceptable):** Any item with **RPN ≥ 36**, or **S = 5** with **O ≥ 2**, or **S × O ≥ 12** requires mandatory risk control (inherent safety by design preferred, then protective measures, then information for safety).
- **Medium Risk (ALARP):** **RPN 16–35** requires risk reduction as far as practicable with documented justification.
- **Low Risk (Acceptable):** **RPN ≤ 15** with **S ≤ 3** is broadly acceptable; monitor through post-market surveillance.

## 4. Design Failure Mode & Effects Analysis Worksheet

| ID | Item / Function | Failure Mode | Potential Effect(s) | S | Potential Cause(s) | O | Current Controls | D | RPN | Risk Control | Post RPN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DFM-001 | <function 1> | <failure mode 1> | <effect 1> | <S> | <cause 1> | <O> | <current control> | <D> | <RPN> | <risk control 1> | <post RPN> |
| DFM-002 | <function 2> | <failure mode 2> | <effect 2> | <S> | <cause 2> | <O> | <current control> | <D> | <RPN> | <risk control 2> | <post RPN> |
| DFM-003 | <function 3> | <failure mode 3> | <effect 3> | <S> | <cause 3> | <O> | <current control> | <D> | <RPN> | <risk control 3> | <post RPN> |

## 5. High-Priority Risk Control Actions
Every risk control measure listed below must be verified for implementation and effectiveness prior to Design Verification closure.

| Action ID | DFMEA ID | Risk Control Measure | Spec / IFU Trace | Verification Ref | Owner | Target Date | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-01 | DFM-001 | <control action 1> | <SPEC ID> | <DVR / DTM ref> | <owner> | <target date> | Open |
| RC-02 | DFM-002 | <control action 2> | <SPEC ID> | <DVR / DTM ref> | <owner> | <target date> | Open |

## 6. Residual Risk Evaluation & Design Readiness
- **Individual Residual Risk Summary:** <total modes> failure modes analyzed; <pre-mitigation count> unacceptable before mitigation; <post-mitigation count> remaining unacceptable after mitigation (must be 0 or supported by benefit-risk analysis).
- **New Hazards Introduced by Controls:** Confirm implemented risk controls do not introduce unmitigated secondary hazards: <secondary hazard check>.
- **Overall Conclusion:** Residual design risk for <product / assembly> is **<risk determination>** (Acceptable / Conditionally Acceptable) to proceed to Design Verification and Validation.

## 7. Approvals & Revision History

| Role | Name | Title | Approval | Date |
| --- | --- | --- | --- | --- |
| **FMEA Facilitator** | <facilitator name> | <facilitator role> | <status> | <date> |
| **R&D Lead** | <R&D approver> | <approver role> | <status> | <date> |
| **Clinical / Risk Mgmt.** | <risk approver> | <approver role> | <status> | <date> |
| **QA Approver** | <QA approver> | <QA role> | <status> | <date> |

| Revision | Effective Date | Author | Summary of Changes |
| --- | --- | --- | --- |
| 1.0 | <effective date> | <facilitator name> | Initial Design FMEA baseline. |
`;
