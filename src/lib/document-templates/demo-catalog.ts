import type { DocumentType } from "@/db/schema";

export const DEMO_TEMPLATE_SECTION_IDS = [
  "supply_chain",
  "design",
  "operations",
  "quality",
  "ma_integration",
] as const;

export type DemoTemplateSectionId = (typeof DEMO_TEMPLATE_SECTION_IDS)[number];

export type DemoTemplateSection = {
  id: DemoTemplateSectionId;
  title: string;
  subtitle: string;
};

export const DEMO_TEMPLATE_SECTIONS: readonly DemoTemplateSection[] = [
  {
    id: "supply_chain",
    title: "Supply Chain",
    subtitle: "Vendor qualification and supplier documentation",
  },
  {
    id: "design",
    title: "Design",
    subtitle: "Product design inputs, outputs, verification, and validation",
  },
  {
    id: "operations",
    title: "Operations",
    subtitle: "Process development, equipment, and manufacturing transfer",
  },
  {
    id: "quality",
    title: "Quality",
    subtitle: "CAPA, deviations, and change control",
  },
  {
    id: "ma_integration",
    title: "M&A Integration",
    subtitle:
      "Post-acquisition transfer of QMS documents, design files, and manufacturing records",
  },
];

export type DemoDocumentTemplate = {
  id: string;
  section: DemoTemplateSectionId;
  title: string;
  description: string;
  documentType: DocumentType;
  documentNoPlaceholder?: string;
  /** Seeded into a generic document body. Omit for structured types. */
  outlineMarkdown?: string;
  /** Thumbnail lines when there is no outline to parse. */
  previewLines?: readonly string[];
  /** Hidden from section grids (header actions such as Blank document). */
  listed?: boolean;
};

function headings(markdown: string, limit = 5): string[] {
  const lines: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^#{1,3}\s+(.*)$/);
    if (!match?.[1]) continue;
    lines.push(match[1].trim());
    if (lines.length >= limit) break;
  }
  return lines;
}

export function templatePreviewLines(
  template: DemoDocumentTemplate
): readonly string[] {
  if (template.previewLines && template.previewLines.length > 0) {
    return template.previewLines;
  }
  if (template.outlineMarkdown) {
    const fromOutline = headings(template.outlineMarkdown);
    if (fromOutline.length > 0) return fromOutline;
  }
  return [template.title];
}

const VENDOR_QUALIFICATION: DemoDocumentTemplate = {
  id: "vendor-qualification",
  section: "supply_chain",
  title: "Vendor Qualification",
  description:
    "Qualify a supplier of critical materials, components, or services.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. VQ-2026-001",
  outlineMarkdown: `# Vendor Qualification

## 1. Purpose
State why this supplier is being qualified and which material or service is in scope.

## 2. Supplier identity
- Legal name and site address
- Quality contact
- Material / component / service
- Proposed qualification grade

## 3. Quality system
Summarize ISO 13485 / GMP / other certifications and the last audit date.

## 4. Questionnaire
Record Yes / No / N.A. answers for quality system, incoming inspection, change notification, and CAPA.

## 5. Impurities and specifications
List specification limits and how the supplier certifies them.

## 6. Risk and scoring
Overall grade (Excellent / Good / Fair / Poor) and remaining actions before approval.

## 7. Approval
Names, roles, and dates for engineering, quality, and supply chain.
`,
};

const USER_REQUIREMENTS: DemoDocumentTemplate = {
  id: "user-requirements",
  section: "design",
  title: "User Requirements",
  description:
    "Capture intended use, user needs, and design inputs from the clinical or customer side.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. URS-2026-001",
  outlineMarkdown: `# User Requirements Specification

## 1. Purpose and intended use
Who uses the product, in what setting, and for what clinical or operational job.

## 2. User needs
Numbered user needs (UN-001 …). Each need should be testable or traced to a design input.

## 3. Use environment
Operating, storage, and transport conditions; users and training assumptions.

## 4. Safety and essential performance
Hazards the design must control; essential performance the user depends on.

## 5. Regulatory and standards
Applicable regulations, standards, and labeling requirements.

## 6. Traceability
How each user need maps to design inputs and later verification.
`,
};

const DESIGN_SPECS: DemoDocumentTemplate = {
  id: "design-specs",
  section: "design",
  title: "Design Specs",
  description:
    "System and component specifications that implement the user requirements.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. SPEC-2026-001",
  outlineMarkdown: `# Design Specification

## 1. Scope
System-level specification and the component specs it contains.

## 2. System specifications
Quantitative design outputs (dimensions, materials, software, interfaces, power).

## 3. Component specifications
One subsection per major component or subsystem, with drawing / part numbers.

## 4. Interface requirements
Mechanical, electrical, fluidic, and data interfaces between components.

## 5. Acceptance criteria
How a unit is judged to meet this specification, including allowed failure rates where relevant.

## 6. Traceability to user requirements
Each spec item traces to one or more user needs.
`,
};

const DFMEA: DemoDocumentTemplate = {
  id: "dfmea",
  section: "design",
  title: "DFMEA",
  description:
    "Design failure mode and effects analysis for the product and its components.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. DFMEA-2026-001",
  outlineMarkdown: `# Design FMEA

## 1. Scope
Product, revision, and the functions covered by this analysis.

## 2. Team and method
Participants, severity / occurrence / detection scales, and RPN thresholds.

## 3. Failure mode analysis

| Item / function | Potential failure mode | Potential effects | Sev | Potential causes | Occ | Current controls | Det | RPN | Recommended actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

## 4. High-RPN actions
Actions, owners, and target dates for items above the RPN threshold.

## 5. Residual risk
Whether remaining risk is acceptable for design verification and validation.
`,
};

const DESIGN_TEST_METHODS: DemoDocumentTemplate = {
  id: "design-test-methods",
  section: "design",
  title: "Design Test Methods",
  description:
    "Test methods used to verify that the design meets its specifications.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. DTM-2026-001",
  outlineMarkdown: `# Design Test Methods

## 1. Purpose
Which design specifications these methods verify.

## 2. Method index

| Method ID | Title | Specs verified | Sample size | Equipment |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 3. Method details
For each method: principle, apparatus, procedure, data recording, and pass/fail rule.

## 4. Allowed failures
State the percentage of failures allowed, if any, and the statistical rationale.

## 5. References
Standards, work instructions, and related TMV documents.
`,
};

const TEST_METHOD_VALIDATION: DemoDocumentTemplate = {
  id: "test-method-validation",
  section: "design",
  title: "Test Method Validation",
  description:
    "Show that design test methods can be executed reliably and as written.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. TMV-2026-001",
  outlineMarkdown: `# Test Method Validation

## 1. Purpose
Can the design test method be executed as written, with acceptable precision and bias?

## 2. Method under validation
Method ID, revision, and the specification it supports.

## 3. Validation protocol
Accuracy, precision, intermediate precision, range, robustness, and sample plan.

## 4. Results
Summarize data against pre-defined acceptance criteria.

## 5. Conclusion
Validated / not validated, with limitations and training notes.
`,
};

const DESIGN_VERIFICATION: DemoDocumentTemplate = {
  id: "design-verification",
  section: "design",
  title: "Design Verification Testing",
  description:
    "Test plan and report showing the product matches design specs, including allowed failures.",
  documentType: "design_verification",
  documentNoPlaceholder: "e.g. DVR-2026-001",
  previewLines: [
    "Purpose & scope",
    "Traceability",
    "Test methods",
    "Results",
    "Conclusion",
  ],
};

const DESIGN_VALIDATION: DemoDocumentTemplate = {
  id: "design-validation",
  section: "design",
  title: "Design Validation",
  description:
    "Validation that the product meets user needs, typically by a group of physicians or intended users.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. DVAL-2026-001",
  outlineMarkdown: `# Design Validation

## 1. Purpose
Confirm the product meets user needs in the intended use environment.

## 2. Validators
Physician / user group, specialties, sites, and training provided.

## 3. Protocol
Tasks, success criteria, number of users, and how observations are recorded.

## 4. Results
Task success, use errors, and residual risks.

## 5. Conclusion
Validated for intended use, with any labeling or training follow-ups.
`,
};

const PROCESS_FLOW: DemoDocumentTemplate = {
  id: "process-flow-diagram",
  section: "operations",
  title: "Process Flow Diagram",
  description:
    "Manufacturing process flow from incoming material through finished goods.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. PFD-2026-001",
  outlineMarkdown: `# Process Flow Diagram

## 1. Purpose
Describe the manufacturing process at the level used for validation and PFMEA.

## 2. Process overview
Start and end points, batch vs continuous, and the facility / line.

## 3. Flow
Numbered steps (incoming → process → in-process test → packaging → release). Note inspection points.

## 4. Inputs and outputs
Materials, utilities, and waste at each major step.

## 5. Critical steps
Steps that affect product quality or that feed the PFMEA and process validation.
`,
};

const EQ_PLAN: DemoDocumentTemplate = {
  id: "equipment-qualification-plan",
  section: "operations",
  title: "Equipment Qualification Plan",
  description:
    "Plan for IQ / OQ / PQ of manufacturing or laboratory equipment.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. EQP-2026-001",
  outlineMarkdown: `# Equipment Qualification Plan

## 1. Purpose and scope
Equipment identity, installed location, and the qualification approach (IQ / OQ / PQ).

## 2. Responsibilities
Engineering, quality, and the equipment owner.

## 3. IQ protocol summary
Installation checks, utilities, software, and documentation.

## 4. OQ protocol summary
Operating ranges, alarms, and challenge tests.

## 5. PQ protocol summary
Process-representative runs and acceptance criteria.

## 6. Deliverables
Which reports, deviations, and change records this plan will produce.
`,
};

const EQ_REPORT: DemoDocumentTemplate = {
  id: "equipment-qualification-report",
  section: "operations",
  title: "Equipment Qualification Report",
  description:
    "Report of IQ / OQ / PQ execution and the qualified status of the equipment.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. EQR-2026-001",
  outlineMarkdown: `# Equipment Qualification Report

## 1. Purpose
Record the executed qualification and the resulting qualified state.

## 2. Equipment identity
ID, model, serial, location, and software version.

## 3. IQ / OQ / PQ summary
What was executed, deviations, and whether acceptance criteria were met.

## 4. Deviations and changes
Open items that affect the qualified state.

## 5. Conclusion
Qualified / not qualified, with the approved operating range.
`,
};

const GOI: DemoDocumentTemplate = {
  id: "graphic-operator-interface",
  section: "operations",
  title: "Graphic Operator Interface",
  description:
    "Manufacturing process instructions and the operator interface on the line.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. GOI-2026-001",
  outlineMarkdown: `# Graphic Operator Interface

## 1. Purpose
Process instructions the operator follows at the station, including HMI screens.

## 2. Station and product
Line, station, product family, and revision of this instruction.

## 3. Setup
Materials, tools, and HMI / recipe selection before the run.

## 4. Operating steps
Illustrated or numbered steps, including in-process checks.

## 5. Alarms and recoveries
What the operator does when the interface flags a fault.

## 6. Records
What is signed, scanned, or printed at the end of the batch.
`,
};

const PROCESS_CHAR: DemoDocumentTemplate = {
  id: "process-characterisation",
  section: "operations",
  title: "Process Characterisation",
  description:
    "Edge cases and operating parameters that define the process window.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. PC-2026-001",
  outlineMarkdown: `# Process Characterisation

## 1. Purpose
Identify critical process parameters and the proven acceptable range.

## 2. Parameters studied

| Parameter | Range studied | Unit | Effect on CQA | Critical? |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 3. Edge cases
Worst-case combinations that were run and why they bound the window.

## 4. Results
What the data showed for each parameter, including interactions.

## 5. Proposed operating ranges
Set-points and limits to carry into process validation.
`,
};

const OPS_TEST_METHOD: DemoDocumentTemplate = {
  id: "process-test-method",
  section: "operations",
  title: "Test Method",
  description:
    "In-process or release test method used in manufacturing.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. TM-2026-001",
  outlineMarkdown: `# Test Method

## 1. Purpose
What this method measures and which specification it supports.

## 2. Materials and equipment
Reagents, instruments, and qualified status.

## 3. Procedure
Sample preparation, measurement, and calculations.

## 4. Acceptance criteria
Numeric limits and how many units may fail.

## 5. Records
Where results are recorded and who reviews them.
`,
};

const TMV_PLAN_REPORT: DemoDocumentTemplate = {
  id: "tmv-plan-report",
  section: "operations",
  title: "TMV Plan & Report",
  description:
    "Test method validation plan and report for a manufacturing test method.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. TMV-Mfg-2026-001",
  outlineMarkdown: `# Test Method Validation Plan & Report

## 1. Purpose
Plan and report in one document: can this manufacturing test method be executed as written?

## 2. Method under validation
Method ID, revision, and the in-process or release spec it supports.

## 3. Plan
Characteristics (accuracy, precision, robustness), sample plan, and acceptance criteria.

## 4. Execution and results
Data vs the plan. Note protocol deviations.

## 5. Conclusion
Validated for routine use, with any restrictions on range or operators.
`,
};

const PV_PLAN_REPORT: DemoDocumentTemplate = {
  id: "process-validation-plan-report",
  section: "operations",
  title: "Process Validation Plan & Report",
  description:
    "Process validation protocol and report for the manufacturing process.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. PV-2026-001",
  outlineMarkdown: `# Process Validation Plan & Report

## 1. Purpose
Demonstrate that the process consistently produces product meeting specifications.

## 2. Process and product
Product, line, batch size, and the process flow this validation covers.

## 3. Plan
Number of runs, worst-case settings, sampling, and acceptance criteria.

## 4. Results
Run-by-run summary against the plan, including yield and deviations.

## 5. Conclusion
Process is validated / not validated, with the approved operating window.
`,
};

const MASTER_VALIDATION: DemoDocumentTemplate = {
  id: "master-validation-plan-report",
  section: "operations",
  title: "Master Validation Plan & Report",
  description:
    "Site or product-family master validation plan and status report.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MVP-2026-001",
  outlineMarkdown: `# Master Validation Plan & Report

## 1. Purpose
Overall validation strategy for this product family or site.

## 2. Scope
Facilities, utilities, equipment, processes, software, and test methods in scope.

## 3. Approach
IQ / OQ / PQ, process validation, TMV, and cleaning validation — what applies and why.

## 4. Deliverable matrix

| Deliverable | Owner | Status | Document no. |
| --- | --- | --- | --- |
|  |  |  |  |

## 5. Status and gaps
What is complete, what is open, and what blocks release.
`,
};

const DESIGN_TRANSFER: DemoDocumentTemplate = {
  id: "design-transfer",
  section: "operations",
  title: "Design Transfer",
  description:
    "Transfer of the design to manufacturing, including remaining open items.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. DT-2026-001",
  outlineMarkdown: `# Design Transfer

## 1. Purpose
Record that design outputs are complete, transferred, and manufacturable.

## 2. Design outputs transferred
Specifications, drawings, BOM, procedures, and inspection methods.

## 3. Manufacturing readiness
Equipment, fixtures, training, and process documentation in place.

## 4. Open items
Gaps that manufacturing or quality still own, with owners and dates.

## 5. Approval
Design, manufacturing, and quality sign-off that transfer is complete.
`,
};

const PFMEA: DemoDocumentTemplate = {
  id: "pfmea",
  section: "operations",
  title: "PFMEA",
  description:
    "Process failure mode and effects analysis for the manufacturing process.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. PFMEA-2026-001",
  outlineMarkdown: `# Process FMEA

## 1. Scope
Process steps covered and the product family this analysis applies to.

## 2. Team and method
Participants and the severity / occurrence / detection scales.

## 3. Failure mode analysis

| Process step | Potential failure mode | Potential effects | Sev | Potential causes | Occ | Current controls | Det | RPN | Recommended actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

## 4. High-RPN actions
Actions that must land before process validation.

## 5. Residual risk
Whether remaining process risk is acceptable.
`,
};

const CAPA: DemoDocumentTemplate = {
  id: "capa",
  section: "quality",
  title: "CAPA",
  description:
    "Corrective and preventive action record — investigation, actions, and effectiveness.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. CAPA-2026-001",
  outlineMarkdown: `# CAPA

## 1. Description
What happened, when it was detected, and how it was reported.

## 2. Immediate actions
Containment and any product hold.

## 3. Investigation
Root cause method, evidence, and the identified cause.

## 4. Corrective actions
What will prevent recurrence, owners, and target dates.

## 5. Preventive actions
System-level changes beyond the original event.

## 6. Effectiveness check
How and when effectiveness will be verified.
`,
};

const DEVIATIONS: DemoDocumentTemplate = {
  id: "deviations",
  section: "quality",
  title: "Deviations",
  description:
    "Deviation investigation report using the DMAIC investigation template.",
  documentType: "investigation_report",
  documentNoPlaceholder: "e.g. DEV/PK/26/001",
  previewLines: ["Define", "Measure", "Analyze", "Improve", "Control"],
};

const CHANGE_CONTROL: DemoDocumentTemplate = {
  id: "change-control",
  section: "quality",
  title: "Change Control",
  description:
    "Evaluate, approve, and implement a change to product, process, or documentation.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. CC-2026-001",
  outlineMarkdown: `# Change Control

## 1. Change description
What is changing (product, process, document, supplier) and why.

## 2. Current vs proposed
State before and after, with drawing / document / process references.

## 3. Impact assessment
Quality, regulatory, validation, labeling, inventory, and training impact.

## 4. Implementation plan
Tasks, owners, effective date, and documents to revise.

## 5. Approval
Roles that must approve before implementation.

## 6. Close-out
Evidence the change was implemented and any follow-up CAPA.
`,
};

const DOCUMENT_TEMPLATE_TRANSFER: DemoDocumentTemplate = {
  id: "document-template-transfer",
  section: "ma_integration",
  title: "Document & Template Transfer",
  description:
    "Moving SOPs, work instructions, forms and templates into the acquirer's QMS, remapping document numbering, formats and approval workflows. Highest-volume item.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-DOC-2026-001",
  outlineMarkdown: `# Document & Template Transfer

## 1. Purpose and scope
Which acquired-site documents move into the acquirer QMS and which stay local or retire.

## 2. Inventory
- Document type (SOP, WI, form, template, policy)
- Legacy document number and title
- Owner / department
- Effective and next-review dates
- Controlled copies / training links

## 3. Numbering and format map
Legacy number → acquirer number; Word/PDF template remapping; header/footer and approval-block rules.

## 4. Approval workflow
Who reviews and approves each remapped document under the acquirer QMS.

## 5. Migration plan
Batch order, owners, target go-live, and training cutover.

## 6. Gaps and retirements
Documents with no acquirer equivalent, obsolete items, and temporary dual-control periods.

## 7. Close-out
Evidence all in-scope documents are live or retired, with training complete.
`,
};

const DHF_DMR_TRANSFER: DemoDocumentTemplate = {
  id: "dhf-dmr-transfer",
  section: "ma_integration",
  title: "DHF & DMR Transfer",
  description:
    "Design inputs/outputs, V&V, traceability, drawings, specs, BOMs re-indexed into acquirer PLM/QMS.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-DHF-2026-001",
  outlineMarkdown: `# DHF & DMR Transfer

## 1. Purpose and products
Product families whose design history and device master records move to the acquirer.

## 2. DHF inventory
Design inputs/outputs, risk files, V&V protocols/reports, labeling, and traceability matrices.

## 3. DMR inventory
Drawings, specs, BOMs, manufacturing/inspection procedures, and approved component lists.

## 4. Re-indexing map
Legacy IDs → acquirer PLM/QMS IDs; revision and status rules.

## 5. Completeness check
Missing or superseded design artifacts; open V&V or transfer gaps.

## 6. Ownership and access
Who owns each record after cutover; vault/PLM permissions.

## 7. Close-out
Sign-off that DHF/DMR content is complete and searchable in the acquirer systems.
`,
};

const RISK_FILE_TRANSFER: DemoDocumentTemplate = {
  id: "risk-file-transfer",
  section: "ma_integration",
  title: "Risk File Transfer",
  description:
    "DFMEA/PFMEA/hazard analysis reformatted to acquirer ISO 14971 methodology and scales; re-link to requirements/controls.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-RISK-2026-001",
  outlineMarkdown: `# Risk File Transfer

## 1. Purpose and scope
Products and processes whose DFMEA, PFMEA, and hazard analyses move to the acquirer method.

## 2. Source risk files
List of risk documents, revision, and last review date at the acquired site.

## 3. Methodology alignment
Acquirer ISO 14971 scales, severity/occurrence/detectability definitions, and residual-risk criteria vs legacy.

## 4. Reformatting plan
How each failure mode / hazard maps into the acquirer template; what stays narrative vs tabular.

## 5. Requirements and controls re-link
Trace each risk item to design/process requirements and existing controls.

## 6. Residual risk and gaps
Where scores change under the new scales; actions before acceptance.

## 7. Close-out
Approved risk files live in the acquirer QMS with owners and next review dates.
`,
};

const ECO_MIGRATION: DemoDocumentTemplate = {
  id: "eco-migration",
  section: "ma_integration",
  title: "ECO Migration",
  description:
    "Open/in-flight ECO/ECN, change history, impact assessments; align change classification rules.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-ECO-2026-001",
  outlineMarkdown: `# ECO Migration

## 1. Purpose and cutover date
When open ECO/ECN work stops on the legacy system and continues under the acquirer change process.

## 2. Open / in-flight changes
Legacy ECO/ECN number, title, status, owner, and target implementation date.

## 3. Change history snapshot
Closed changes that must remain searchable for design and regulatory history.

## 4. Classification alignment
Legacy change classes → acquirer classes; impact-assessment fields that must be remapped.

## 5. Impact assessments to carry forward
Quality, regulatory, validation, labeling, inventory, and training impacts still open.

## 6. Migration actions
Which ECOs close before cutover, which reopen as acquirer changes, and owners.

## 7. Close-out
No orphaned open changes; acquirer change control owns all remaining work.
`,
};

const SUPPLIER_VENDOR_TRANSFER: DemoDocumentTemplate = {
  id: "supplier-vendor-transfer",
  section: "ma_integration",
  title: "Supplier & Vendor Transfer",
  description:
    "Re-qualify or grandfather suppliers onto ASL; supplier files, audits, scorecards.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-SUP-2026-001",
  outlineMarkdown: `# Supplier & Vendor Transfer

## 1. Purpose and scope
Suppliers of materials, components, or services moving onto the acquirer ASL.

## 2. Supplier inventory
Legal name, site, commodities, criticality, and current approval status.

## 3. Grandfather vs re-qualify
Criteria for accepting existing approvals vs requiring new questionnaires/audits.

## 4. Supplier files to transfer
Quality agreements, certificates, audit reports, scorecards, and change-notification history.

## 5. ASL mapping
Legacy supplier codes → acquirer ASL entries; purchasing and incoming-inspection links.

## 6. Open actions
Pending audits, CAPAs on suppliers, and qualification gaps before go-live.

## 7. Close-out
ASL live; purchasing and quality agree which suppliers are approved to buy from.
`,
};

const QUALITY_AGREEMENT_TRANSFER: DemoDocumentTemplate = {
  id: "quality-agreement-transfer",
  section: "ma_integration",
  title: "Quality Agreement Transfer",
  description:
    "Re-paper supplier quality agreements onto acquirer template (usually one per supplier).",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-QA-2026-001",
  outlineMarkdown: `# Quality Agreement Transfer

## 1. Purpose
Re-paper supplier quality agreements onto the acquirer template, typically one agreement per supplier.

## 2. Supplier list
Suppliers needing a new or amended quality agreement; priority by criticality and spend.

## 3. Legacy agreement summary
Key obligations, notification windows, audit rights, and complaint/CAPA interfaces.

## 4. Acquirer template gaps
Clauses that differ (change control, records retention, right of access, sub-tier flow-down).

## 5. Negotiation and signing plan
Owners, legal/quality reviewers, and target execution dates.

## 6. Interim controls
How supply continues while agreements are unsigned.

## 7. Close-out
Executed agreements filed; ASL and purchasing references updated.
`,
};

const EQUIPMENT_QUALIFICATION_TRANSFER: DemoDocumentTemplate = {
  id: "equipment-qualification-transfer",
  section: "ma_integration",
  title: "Equipment Qualification",
  description:
    "Equipment inventory, calibration, maintenance, IQ/OQ/PQ protocols/reports, gap assessment vs acquirer validation standards.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-EQ-2026-001",
  outlineMarkdown: `# Equipment Qualification Transfer

## 1. Purpose and sites
Equipment at acquired sites that must meet acquirer qualification and metrology standards.

## 2. Equipment inventory
Asset ID, description, location, criticality, and current qualification status.

## 3. Calibration and maintenance
Schedules, providers, last/next due dates, and out-of-tolerance history.

## 4. IQ / OQ / PQ package
Existing protocols and reports; what is complete vs missing.

## 5. Gap assessment
Where legacy validation falls short of acquirer standards; required re-qualification.

## 6. Remediation plan
Tasks, owners, and dates for calibration catch-up and qualification gaps.

## 7. Close-out
Equipment released for use under acquirer controls with current status recorded.
`,
};

const PROCESS_TEST_METHOD_TRANSFER: DemoDocumentTemplate = {
  id: "process-test-method-transfer",
  section: "ma_integration",
  title: "Process & Test Method Transfer",
  description:
    "Process validation, TMV, gauge R&R, software validation for production/test systems.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-PTM-2026-001",
  outlineMarkdown: `# Process & Test Method Transfer

## 1. Purpose and scope
Processes and test methods transferring with the product into the acquirer manufacturing/QMS stack.

## 2. Process validation status
PV protocols/reports, acceptance criteria, and remaining open runs.

## 3. Test method validation
TMV packages, gauge R&R results, and methods that need re-validation.

## 4. Production and test software
Systems in scope for software validation; version and configuration baseline.

## 5. Acquirer standard gaps
Where legacy evidence does not meet acquirer PV/TMV/CSV requirements.

## 6. Transfer and remediation plan
Owners, protocols to rewrite, and cutover sequence.

## 7. Close-out
Validated processes and methods released; residual actions tracked.
`,
};

const PART_BOM_MIGRATION: DemoDocumentTemplate = {
  id: "part-bom-migration",
  section: "ma_integration",
  title: "Part & BOM Migration",
  description:
    "Part numbers, revisions, BOM structures, AMLs into ERP/PLM; resolve number conflicts.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-BOM-2026-001",
  outlineMarkdown: `# Part & BOM Migration

## 1. Purpose and systems
Legacy ERP/PLM sources and the acquirer targets for parts, revisions, BOMs, and AMLs.

## 2. Part number inventory
Legacy PN, description, revision, UoM, and lifecycle status.

## 3. Conflict resolution
Duplicate or colliding numbers; rename / alias / dual-number rules.

## 4. BOM structures
Multi-level BOMs to migrate; effective dates and alternate BOMs.

## 5. Approved manufacturer lists
AML entries, preferred suppliers, and links to drawings/specs.

## 6. Migration waves
Pilot vs full cutover; data owners and validation checks.

## 7. Close-out
Parts and BOMs live in acquirer ERP/PLM; purchasing and manufacturing confirm readiness.
`,
};

const COMPLAINT_CAPA_MIGRATION: DemoDocumentTemplate = {
  id: "complaint-capa-migration",
  section: "ma_integration",
  title: "Complaint & CAPA Migration",
  description:
    "Open/closed CAPAs, NCRs, complaint history; re-baseline open items for ongoing investigation/regulatory reporting.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. MA-CAPA-2026-001",
  outlineMarkdown: `# Complaint & CAPA Migration

## 1. Purpose and regulatory context
Complaint, NCR, and CAPA records that must stay available for investigation and reporting after close.

## 2. Open items
Open CAPAs, NCRs, and complaints with owners, due dates, and current phase.

## 3. Closed history
Volume and retention of closed records needed for trending and regulatory history.

## 4. Re-baseline plan
How open items map into the acquirer system; new numbers, statuses, and investigation owners.

## 5. Reporting interfaces
MDR/vigilance and management-review feeds that must not break during cutover.

## 6. Data migration checks
Completeness, attachment links, and cross-references to product/lot/serial data.

## 7. Close-out
Open items active in the acquirer QMS; closed history searchable; QA confirms reporting continuity.
`,
};

export const BLANK_DOCUMENT_TEMPLATE: DemoDocumentTemplate = {
  id: "blank-document",
  section: "design",
  title: "Blank document",
  description: "Start from an empty page with no outline.",
  documentType: "generic_document",
  documentNoPlaceholder: "e.g. DOC-2026-001",
  listed: false,
};

export const DEMO_DOCUMENT_TEMPLATES: readonly DemoDocumentTemplate[] = [
  VENDOR_QUALIFICATION,
  USER_REQUIREMENTS,
  DESIGN_SPECS,
  DFMEA,
  DESIGN_TEST_METHODS,
  TEST_METHOD_VALIDATION,
  DESIGN_VERIFICATION,
  DESIGN_VALIDATION,
  PROCESS_FLOW,
  EQ_PLAN,
  EQ_REPORT,
  GOI,
  PROCESS_CHAR,
  OPS_TEST_METHOD,
  TMV_PLAN_REPORT,
  PV_PLAN_REPORT,
  MASTER_VALIDATION,
  DESIGN_TRANSFER,
  PFMEA,
  CAPA,
  DEVIATIONS,
  CHANGE_CONTROL,
  DOCUMENT_TEMPLATE_TRANSFER,
  DHF_DMR_TRANSFER,
  RISK_FILE_TRANSFER,
  ECO_MIGRATION,
  SUPPLIER_VENDOR_TRANSFER,
  QUALITY_AGREEMENT_TRANSFER,
  EQUIPMENT_QUALIFICATION_TRANSFER,
  PROCESS_TEST_METHOD_TRANSFER,
  PART_BOM_MIGRATION,
  COMPLAINT_CAPA_MIGRATION,
  BLANK_DOCUMENT_TEMPLATE,
];

const TEMPLATE_BY_ID = new Map(
  DEMO_DOCUMENT_TEMPLATES.map((template) => [template.id, template])
);

export function demoTemplateById(
  id: string
): DemoDocumentTemplate | undefined {
  return TEMPLATE_BY_ID.get(id);
}

export function listedDemoTemplates(): DemoDocumentTemplate[] {
  return DEMO_DOCUMENT_TEMPLATES.filter((template) => template.listed !== false);
}

export function listedDemoTemplatesInSection(
  section: DemoTemplateSectionId
): DemoDocumentTemplate[] {
  return listedDemoTemplates().filter((template) => template.section === section);
}

export type DemoTemplateMetadata = {
  demoTemplateId: string;
  demoTemplateTitle: string;
  demoTemplateSection: DemoTemplateSectionId;
};

export function demoTemplateMetadata(
  template: DemoDocumentTemplate
): DemoTemplateMetadata {
  return {
    demoTemplateId: template.id,
    demoTemplateTitle: template.title,
    demoTemplateSection: template.section,
  };
}

export function demoTemplateTitleFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const title = metadata.demoTemplateTitle;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}
