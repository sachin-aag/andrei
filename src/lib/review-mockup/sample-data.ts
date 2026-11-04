export type FindingSeverity = "critical" | "major" | "minor";
export type AgentCategory = "recommended" | "qms" | "design" | "requirements";
export type ReviewMockupTab =
  | "assistant"
  | "skills"
  | "playbooks"
  | "agents"
  | "trace";

export type ReviewFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  location: string;
  body: string;
  anchorId: string;
  agentId: string;
  playbookRuleId?: string;
  suggestedReplacement?: string;
};

export type ReviewAgent = {
  id: string;
  title: string;
  description: string;
  icon: "file" | "pen" | "list" | "git" | "book";
  categories: AgentCategory[];
  basis: string;
  scope: string;
  runsOn: string;
  steps: string[];
  findingIds: string[];
};

export type ReviewPlaybook = {
  id: string;
  title: string;
  source: string;
  ruleCount: number;
  ownerGroup: string;
  owner: string;
  updated: string;
  governance: string;
  icon: "file" | "eye" | "flask" | "pen" | "grid";
  sampleRules: { id: string; text: string }[];
  findingIds: string[];
};

export type ReviewSkill = {
  id: string;
  title: string;
  description: string;
  runs: number;
  icon: "table" | "book" | "git" | "shield";
  input: string;
  output: string;
};

export type TraceStatus =
  | "verified"
  | "criterion_subjective"
  | "wider_than_input"
  | "no_test"
  | "claimed_elsewhere"
  | "overheat";

export type TraceRow = {
  id: string;
  source: string;
  test: string | null;
  status: TraceStatus;
  statusLabel: string;
  gap: boolean;
  weak: boolean;
  anchorId?: string;
};

export const REVIEW_MOCKUP_DOCUMENT = {
  company: "Kestrel Medical",
  documentNo: "DVP-0142",
  revision: "B",
  status: "Draft for review",
  title: "Design Verification Protocol: AX-7 Irrigated RF Ablation Catheter",
  subtitle:
    "Tip temperature, contact force, irrigation and tip-joint integrity · Build configuration BC-3",
  author: "R. Iyer",
  authorRole: "Author, R&D",
  reviewerRole: "Quality",
  detectedType: "Design Verification Protocol",
  detectedClause: "DHF · ISO 13485 §7.3.6",
} as const;

export const REVIEW_FINDINGS: ReviewFinding[] = [
  {
    id: "di-038",
    severity: "critical",
    title: "DI-038 (electrical isolation) has no test",
    location: "§7",
    body: "DIS-0088 allocates DI-038 to the tip assembly, but no TM covers it. The coverage statement in §7 is therefore incorrect.",
    anchorId: "coverage-statement",
    agentId: "traceability-gaps",
  },
  {
    id: "tm-02-subjective",
    severity: "critical",
    title: "Subjective acceptance criterion",
    location: "§7 TM-02 · Acceptance Criteria Objectivity",
    body: 'TM-02 passes if readings are "acceptable to the R&D Engineer". Criteria must be set before testing; this is a common 483 observation.',
    anchorId: "tm-02-criterion",
    agentId: "acceptance-objectivity",
    playbookRuleId: "AF-02",
    suggestedReplacement:
      "Measured force within ±5 g (0–20 g) and ±10% (20–60 g) of the applied reference load",
  },
  {
    id: "n-30-rationale",
    severity: "critical",
    title: "No statistical rationale for n = 30",
    location: "§6.2 · Sample Size Rationale",
    body: "Sample size is stated as n = 30 with no confidence, reliability, or AQL justification. This is a repeat 483 finding when sample size is set by convenience.",
    anchorId: "sample-size",
    agentId: "sample-size",
    playbookRuleId: "AF-05",
  },
  {
    id: "af-02-repeat",
    severity: "critical",
    title: "Repeats 483 Obs. 3 (AF-02)",
    location: "§7 TM-02",
    body: "TM-02's criterion depends on the tester's judgement. This is the same finding as the March 2025 483, so a repeat would weaken the CAPA-2025-017 effectiveness check.",
    anchorId: "tm-02-criterion",
    agentId: "traceability-gaps",
    playbookRuleId: "AF-02",
  },
  {
    id: "rc-12",
    severity: "major",
    title: "RC-12 points here but is not verified",
    location: "§3 References",
    body: 'RMF-0019 lists risk control RC-12 (char formation at high power) as "verified by DVP-0142". No test in this protocol verifies it.',
    anchorId: "ref-rmf",
    agentId: "traceability-gaps",
  },
  {
    id: "tm-03-wider",
    severity: "major",
    title: "Irrigation window wider than the design input",
    location: "§7 TM-03",
    body: "DI-036 is 15 mL/min ±1. TM-03 accepts 13–17 mL/min, which is wider than the input and would pass a nonconforming unit.",
    anchorId: "tm-03-criterion",
    agentId: "traceability-gaps",
  },
  {
    id: "pencil-transcribe",
    severity: "major",
    title: "Results may be recorded in pencil and transcribed later",
    location: "§9.1",
    body: "Datasheets transcribed after the fact repeat internal audit IA-26-02. Original observations must land on the controlled record.",
    anchorId: "data-recording",
    agentId: "roles-records",
    playbookRuleId: "AF-08",
  },
  {
    id: "should-obligation",
    severity: "major",
    title: '"Should" used for a recording duty',
    location: "§9.1",
    body: 'The R&D Engineer "should" record results. Recording on DS-0142 is a required activity; use shall.',
    anchorId: "data-recording",
    agentId: "normative-language",
  },
  {
    id: "broken-xref",
    severity: "major",
    title: "Section 7.3 does not exist",
    location: "§7 Test coverage",
    body: "Pre-conditioning deviations are handled per Section 7.3, but this protocol has no §7.3.",
    anchorId: "coverage-statement",
    agentId: "cross-refs",
  },
  {
    id: "qsr-820",
    severity: "major",
    title: "Legacy QSR clause still cited",
    location: "§1 Purpose",
    body: "21 CFR 820.30(f) no longer exists after FDA’s QMSR took effect on 2 Feb 2026. Map this to ISO 13485:2016 §7.3.6.",
    anchorId: "purpose",
    agentId: "qmsr-citation",
  },
  {
    id: "quality-signoff",
    severity: "major",
    title: "Quality approval is still a placeholder",
    location: "Approvals",
    body: "Quality sign-off still reads [INSERT NAME] / XX-XX-2026. Do not route while the approval block is incomplete.",
    anchorId: "approvals",
    agentId: "approvals",
  },
  {
    id: "rev-history",
    severity: "major",
    title: "Rev B change description is blank",
    location: "Revision History",
    body: "Rev B: [INSERT] does not describe what changed since Rev A.",
    anchorId: "revision-history",
    agentId: "approvals",
  },
  {
    id: "iso-14971-edition",
    severity: "major",
    title: "ISO 14971 cited as the 2007 edition",
    location: "§3 References",
    body: "ISO 14971:2007 is withdrawn. Current recognition is ISO 14971:2019.",
    anchorId: "ref-iso-14971",
    agentId: "standards-register",
  },
  {
    id: "tm-01-missing-tmv",
    severity: "major",
    title: "TM-01 has no test-method validation",
    location: "§7 TM-01",
    body: "Tip-temperature accuracy has no TMV reference. QP-TMV-002 requires a validated method before protocol execution.",
    anchorId: "tm-01",
    agentId: "tmv-policy",
  },
  {
    id: "adequate-word",
    severity: "minor",
    title: 'Unmeasurable word "acceptable"',
    location: "§7 TM-02",
    body: '"Acceptable to the R&D Engineer" is flagged by the ISO/IEC Directives Pt 2 check for unmeasurable obligation.',
    anchorId: "tm-02-criterion",
    agentId: "normative-language",
  },
  {
    id: "periodic-missing",
    severity: "minor",
    title: "No retention period on DS-0142",
    location: "§9 Data Recording",
    body: "Every record created needs a form number and retention period (ISO 13485 §4.2.5). DS-0142 is named but not retained.",
    anchorId: "data-recording",
    agentId: "roles-records",
  },
  {
    id: "dut-definition",
    severity: "minor",
    title: "DUT definition is too thin for a protocol",
    location: "§4 Definitions",
    body: "DUT is defined as “Device under test” with no serial/lot or build configuration cross-walk to BC-3.",
    anchorId: "definitions",
    agentId: "terminology",
  },
  {
    id: "pilot-line",
    severity: "minor",
    title: "Pilot line PL-2 is unnamed in equipment",
    location: "§2 Scope",
    body: "Scope names pilot line PL-2, but §8 Test equipment does not list the line or its qualification status.",
    anchorId: "scope",
    agentId: "equipment-cal",
  },
  {
    id: "ncr-def",
    severity: "minor",
    title: "NCR process is named but not referenced",
    location: "§4 Definitions",
    body: "NCR is defined, then used in 9.2 with no SOP for nonconformance handling.",
    anchorId: "definitions",
    agentId: "roles-records",
  },
  {
    id: "flow-nominal",
    severity: "minor",
    title: "Nominal irrigation flow is restated without a method",
    location: "§2 Scope",
    body: "Scope states 15 mL/min during ablation but does not point at TM-03.",
    anchorId: "scope",
    agentId: "input-output",
  },
  {
    id: "iec-edition",
    severity: "minor",
    title: "IEC 60601-2-2 edition is current",
    location: "§3 References",
    body: "IEC 60601-2-2:2017 is still recognized. No action required; listed for the edition register.",
    anchorId: "ref-iec",
    agentId: "standards-register",
  },
  {
    id: "iso-10555",
    severity: "minor",
    title: "ISO 10555-1 cited without year",
    location: "§3 References",
    body: "ISO 10555-1 has no edition year. Confirm the recognized edition before execution.",
    anchorId: "ref-iso-10555",
    agentId: "standards-register",
  },
];

export const REVIEW_AGENTS: ReviewAgent[] = [
  {
    id: "qmsr-citation",
    title: "QMSR Citation Update",
    description:
      "Flags legacy QSR clauses (820.30, 820.198…) that no longer exist since FDA’s QMSR took effect on 2 Feb 2026, and maps each to its ISO 13485:2016 clause.",
    icon: "file",
    categories: ["recommended", "qms"],
    basis: "21 CFR 820 (QMSR)",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Scanning citations in DVP-0142",
      "Mapping QSR clauses to ISO 13485:2016",
      "Writing findings",
    ],
    findingIds: ["qsr-820"],
  },
  {
    id: "normative-language",
    title: "Normative Language Audit",
    description:
      'Checks that "shall / should / may" carry the intended obligation and flags unmeasurable words such as "as appropriate", "periodically" or "adequate".',
    icon: "pen",
    categories: ["recommended", "qms"],
    basis: "ISO/IEC Directives Pt 2",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Reading obligation language",
      "Flagging unmeasurable words",
      "Writing findings",
    ],
    findingIds: ["should-obligation", "adequate-word"],
  },
  {
    id: "roles-records",
    title: "Roles & Records Consistency",
    description:
      "Every role named in the procedure has a responsibility, and every record created has a form number and retention period.",
    icon: "list",
    categories: ["recommended", "qms"],
    basis: "ISO 13485 §4.2.5",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Listing named roles and records",
      "Checking form numbers and retention",
      "Writing findings",
    ],
    findingIds: ["pencil-transcribe", "periodic-missing", "ncr-def"],
  },
  {
    id: "traceability-gaps",
    title: "Design Traceability Gaps",
    description:
      "Maps each design input to a verification method and each risk control to verification evidence, using the linked DIS and RMF.",
    icon: "git",
    categories: ["recommended", "design"],
    basis: "ISO 13485 §7.3.6 · ISO 14971 §7.2",
    scope: "Design controls",
    runsOn: "This document + DIS-0088, RMF-0019",
    steps: [
      "Reading DVP-0142 (Design Traceability Gaps)",
      "Resolving links to DIS-0088 and RMF-0019",
      "Writing findings",
    ],
    findingIds: ["di-038", "rc-12", "tm-03-wider", "af-02-repeat"],
  },
  {
    id: "acceptance-objectivity",
    title: "Acceptance Criteria Objectivity",
    description:
      "Requires numeric or otherwise predetermined pass/fail criteria before testing. Blocks tester judgement as the criterion.",
    icon: "pen",
    categories: ["recommended", "design"],
    basis: "FDA 483 Obs. 3 · ISO 13485 §7.3.6",
    scope: "Design controls",
    runsOn: "This document",
    steps: [
      "Reading acceptance criteria cells",
      "Checking for predetermined limits",
      "Writing findings",
    ],
    findingIds: ["tm-02-subjective"],
  },
  {
    id: "sample-size",
    title: "Sample Size Rationale",
    description:
      "Flags n without statistical or risk-based justification (confidence/reliability, AQL, or documented rationale).",
    icon: "list",
    categories: ["recommended", "design"],
    basis: "BSI NC-2025-14",
    scope: "Design controls",
    runsOn: "This document",
    steps: [
      "Finding stated sample sizes",
      "Checking for statistical justification",
      "Writing findings",
    ],
    findingIds: ["n-30-rationale"],
  },
  {
    id: "cross-refs",
    title: "Cross-reference Integrity",
    description:
      "Resolves internal section references and flags pointers to headings that do not exist in this revision.",
    icon: "git",
    categories: ["recommended", "qms"],
    basis: "Kestrel Document Control Standard",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Indexing headings in DVP-0142",
      "Resolving Section N.N pointers",
      "Writing findings",
    ],
    findingIds: ["broken-xref"],
  },
  {
    id: "approvals",
    title: "Approval Completeness",
    description:
      "Blocks routing while approval rows or revision-history entries still contain placeholders.",
    icon: "file",
    categories: ["recommended", "qms"],
    basis: "SOP-QA-001 Rev F",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Reading approval and revision blocks",
      "Scanning placeholders",
      "Writing findings",
    ],
    findingIds: ["quality-signoff", "rev-history"],
  },
  {
    id: "standards-register",
    title: "Recognized Standards Check",
    description:
      "Lists every standard referenced, the edition cited, and its current recognition status.",
    icon: "book",
    categories: ["recommended", "qms"],
    basis: "FDA Recognized Consensus Standards",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Extracting cited standards",
      "Checking recognized editions",
      "Writing findings",
    ],
    findingIds: ["iso-14971-edition", "iec-edition", "iso-10555"],
  },
  {
    id: "tmv-policy",
    title: "Test Method Validation Gate",
    description:
      "Each TM must point at a validated method per QP-TMV-002 before the protocol is executed.",
    icon: "list",
    categories: ["recommended", "design"],
    basis: "QP-TMV-002 Rev B",
    scope: "Design controls",
    runsOn: "This document",
    steps: [
      "Listing test methods",
      "Checking TMV references",
      "Writing findings",
    ],
    findingIds: ["tm-01-missing-tmv"],
  },
  {
    id: "equipment-cal",
    title: "Equipment & Line Qualification",
    description:
      "Pilot lines and measurement equipment named in scope appear in the equipment list with qualification status.",
    icon: "list",
    categories: ["recommended", "design"],
    basis: "ISO 13485 §7.6",
    scope: "Design controls",
    runsOn: "This document",
    steps: [
      "Collecting named equipment and lines",
      "Matching the equipment table",
      "Writing findings",
    ],
    findingIds: ["pilot-line"],
  },
  {
    id: "input-output",
    title: "Input–Output Mapping",
    description:
      "Design inputs stated in scope and purpose have a matching verification method in the TM table.",
    icon: "git",
    categories: ["recommended", "requirements"],
    basis: "ISO 13485 §7.3.2–7.3.6",
    scope: "Requirements",
    runsOn: "This document + DIS-0088",
    steps: [
      "Extracting design inputs",
      "Matching TM coverage",
      "Writing findings",
    ],
    findingIds: ["flow-nominal"],
  },
  {
    id: "terminology",
    title: "Terminology & Style",
    description:
      "Defined terms match Glossary G-001, and DUT/UUT identity is specific enough to execute.",
    icon: "pen",
    categories: ["recommended", "qms"],
    basis: "Kestrel Writing Guide v3 · Glossary G-001",
    scope: "QMS / SOPs",
    runsOn: "This document",
    steps: [
      "Reading definitions",
      "Checking Glossary G-001",
      "Writing findings",
    ],
    findingIds: ["dut-definition"],
  },
  {
    id: "risk-control-coverage",
    title: "Risk Control Coverage",
    description:
      "Every RMF risk control claimed as verified by this protocol has a TM or an explicit rationale.",
    icon: "git",
    categories: ["recommended", "requirements"],
    basis: "ISO 14971 §7.2",
    scope: "Requirements",
    runsOn: "This document + RMF-0019",
    steps: [
      "Reading RMF-0019 verification claims",
      "Matching TMs in DVP-0142",
      "Writing findings",
    ],
    findingIds: ["rc-12"],
  },
];

export const REVIEW_PLAYBOOKS: ReviewPlaybook[] = [
  {
    id: "document-control",
    title: "Kestrel Document Control Standard",
    source: "From SOP-QA-001 Rev F · DV protocol template T-014",
    ruleCount: 14,
    ownerGroup: "Quality Systems",
    owner: "Quality Systems",
    updated: "12 Aug 2026",
    governance: "Rule changes need owner approval and are versioned",
    icon: "file",
    sampleRules: [
      {
        id: "DC-04",
        text: "Revision history describes the change; [INSERT] is not a description.",
      },
      {
        id: "DC-09",
        text: "Approval rows cannot contain placeholders when status is Draft for review.",
      },
      {
        id: "DC-11",
        text: "Internal section references must resolve in this revision.",
      },
    ],
    findingIds: ["quality-signoff", "rev-history", "broken-xref"],
  },
  {
    id: "audit-memory",
    title: "Audit Finding Memory",
    source: "From FDA 483 (Mar 2025) · BSI audit NC-2025-14 · 3 internal audits",
    ruleCount: 11,
    ownerGroup: "Quality Systems",
    owner: "Quality Systems",
    updated: "28 Aug 2026",
    governance: "Rule changes need owner approval and are versioned",
    icon: "eye",
    sampleRules: [
      {
        id: "AF-02",
        text: "483 Obs. 3: acceptance criteria not established before testing. Block subjective criteria.",
      },
      {
        id: "AF-05",
        text: "BSI NC-2025-14: sample sizes without statistical justification.",
      },
      {
        id: "AF-08",
        text: "Internal audit IA-26-02: datasheets transcribed after the fact.",
      },
    ],
    findingIds: ["af-02-repeat", "n-30-rationale", "pencil-transcribe"],
  },
  {
    id: "tmv-policy",
    title: "Test Method Validation Policy",
    source: "From QP-TMV-002 Rev B",
    ruleCount: 6,
    ownerGroup: "R&D Test Engineering",
    owner: "R&D Test Engineering",
    updated: "03 Jun 2026",
    governance: "Rule changes need owner approval and are versioned",
    icon: "flask",
    sampleRules: [
      {
        id: "TMV-01",
        text: "Each TM cites a validated method or a TMV protocol number.",
      },
      {
        id: "TMV-03",
        text: "Measurement equipment in the TM is in the equipment table.",
      },
    ],
    findingIds: ["tm-01-missing-tmv"],
  },
  {
    id: "terminology",
    title: "Terminology & Style",
    source: "From Kestrel Writing Guide v3 · Glossary G-001",
    ruleCount: 22,
    ownerGroup: "Regulatory Affairs",
    owner: "Regulatory Affairs",
    updated: "19 Jul 2026",
    governance: "Rule changes need owner approval and are versioned",
    icon: "pen",
    sampleRules: [
      {
        id: "TS-06",
        text: "DUT/UUT identity includes build configuration when the protocol is build-specific.",
      },
      {
        id: "TS-12",
        text: "Do not use “adequate” or “acceptable” as a pass criterion.",
      },
    ],
    findingIds: ["dut-definition", "adequate-word"],
  },
  {
    id: "risk-matrix",
    title: "Risk Acceptability Matrix",
    source: "From RMP-0002 5×5 matrix · Benefit-risk SOP-RM-004",
    ruleCount: 8,
    ownerGroup: "Risk Management",
    owner: "Risk Management",
    updated: "02 May 2026",
    governance: "Rule changes need owner approval and are versioned",
    icon: "grid",
    sampleRules: [
      {
        id: "RA-02",
        text: "Every RMF verification claim that names this protocol must have a TM here.",
      },
    ],
    findingIds: ["rc-12"],
  },
];

export const REVIEW_SKILLS: ReviewSkill[] = [
  {
    id: "dv-matrix",
    title: "DV test matrix → Excel",
    description:
      "Pulls Test ID, input, method, n and criterion from any DV protocol into the team’s DVR tracker.",
    runs: 23,
    icon: "table",
    input: "DV protocol (.docx)",
    output: "Rows in DVR_tracker.xlsx",
  },
  {
    id: "standards-register",
    title: "Standards cited → edition register",
    description:
      "Lists every standard referenced, the edition cited and its current recognition status.",
    runs: 11,
    icon: "book",
    input: "This document",
    output: "Edition register rows",
  },
  {
    id: "inputs-without-tests",
    title: "Inputs without tests → gap list",
    description:
      "Compares the protocol against the linked DIS and returns design inputs with no verification method.",
    runs: 8,
    icon: "git",
    input: "This document + DIS-0088",
    output: "Gap list",
  },
  {
    id: "hazard-control",
    title: "Hazard → control → verification table",
    description:
      "Builds the ISO 14971 traceability table from the risk analysis and links the verification evidence.",
    runs: 14,
    icon: "shield",
    input: "This document + RMF-0019",
    output: "Hazard–control–verification table",
  },
];

export const TRACE_ROWS: TraceRow[] = [
  {
    id: "DI-031",
    source: "DI-031",
    test: "TM-01",
    status: "verified",
    statusLabel: "Verified",
    gap: false,
    weak: false,
    anchorId: "tm-01",
  },
  {
    id: "DI-034",
    source: "DI-034",
    test: "TM-02",
    status: "criterion_subjective",
    statusLabel: "Criterion subjective",
    gap: false,
    weak: true,
    anchorId: "tm-02-criterion",
  },
  {
    id: "DI-036",
    source: "DI-036",
    test: "TM-03",
    status: "wider_than_input",
    statusLabel: "Wider than input",
    gap: false,
    weak: true,
    anchorId: "tm-03-criterion",
  },
  {
    id: "DI-038",
    source: "DI-038",
    test: null,
    status: "no_test",
    statusLabel: "No test",
    gap: true,
    weak: false,
    anchorId: "coverage-statement",
  },
  {
    id: "DI-040",
    source: "DI-040",
    test: "TM-04",
    status: "verified",
    statusLabel: "Verified",
    gap: false,
    weak: false,
    anchorId: "tm-04",
  },
  {
    id: "RC-12",
    source: "RC-12",
    test: null,
    status: "claimed_elsewhere",
    statusLabel: "Claimed by RMF, not here",
    gap: true,
    weak: false,
    anchorId: "ref-rmf",
  },
  {
    id: "RC-07",
    source: "RC-07",
    test: "TM-01",
    status: "overheat",
    statusLabel: "Overheat detection",
    gap: false,
    weak: false,
    anchorId: "tm-01",
  },
];

export const DV_MATRIX_ROWS = [
  {
    test: "TM-01",
    input: "DI-031",
    method: "Tip temperature accuracy",
    n: "30",
    criterion: "±2 °C vs reference TC",
    flag: "TMV missing",
    flagTone: "warning" as const,
  },
  {
    test: "TM-02",
    input: "DI-034",
    method: "Contact force accuracy",
    n: "30 [TBD]",
    criterion: "Subjective",
    flag: "Rewrite",
    flagTone: "danger" as const,
  },
  {
    test: "TM-03",
    input: "DI-036",
    method: "Irrigation flow rate",
    n: "30 [TBD]",
    criterion: "13–17 mL/min",
    flag: "≠ DI (15 ± 1)",
    flagTone: "danger" as const,
  },
  {
    test: "TM-04",
    input: "DI-040",
    method: "Tip-joint tensile",
    n: "30 [TBD]",
    criterion: "≥ 15 N, no separation",
    flag: "OK",
    flagTone: "ok" as const,
  },
];

export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
  recommended: "Recommended",
  qms: "QMS / SOPs",
  design: "Design controls",
  requirements: "Requirements",
};

export const SEVERITY_ORDER: FindingSeverity[] = [
  "critical",
  "major",
  "minor",
];

export function findingsByIds(ids: string[]): ReviewFinding[] {
  const byId = new Map(REVIEW_FINDINGS.map((finding) => [finding.id, finding]));
  return ids.flatMap((id) => {
    const finding = byId.get(id);
    return finding ? [finding] : [];
  });
}

export function countBySeverity(findings: ReviewFinding[]): Record<
  FindingSeverity,
  number
> {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    major: findings.filter((f) => f.severity === "major").length,
    minor: findings.filter((f) => f.severity === "minor").length,
  };
}

export function agentsInCategory(category: AgentCategory): ReviewAgent[] {
  return REVIEW_AGENTS.filter((agent) => agent.categories.includes(category));
}

export function recommendedAgents(): ReviewAgent[] {
  return agentsInCategory("recommended");
}

export function allRecommendedFindings(): ReviewFinding[] {
  const ids = new Set(
    recommendedAgents().flatMap((agent) => agent.findingIds)
  );
  return SEVERITY_ORDER.flatMap((severity) =>
    REVIEW_FINDINGS.filter((finding) => ids.has(finding.id) && finding.severity === severity)
  );
}

export function findingById(id: string): ReviewFinding | undefined {
  return REVIEW_FINDINGS.find((finding) => finding.id === id);
}

export function agentById(id: string): ReviewAgent | undefined {
  return REVIEW_AGENTS.find((agent) => agent.id === id);
}

export function playbookById(id: string): ReviewPlaybook | undefined {
  return REVIEW_PLAYBOOKS.find((playbook) => playbook.id === id);
}

export function skillById(id: string): ReviewSkill | undefined {
  return REVIEW_SKILLS.find((skill) => skill.id === id);
}

export const TRACE_SUMMARY = {
  traced: TRACE_ROWS.filter((row) => !row.gap && !row.weak).length,
  weak: TRACE_ROWS.filter((row) => row.weak).length,
  gaps: TRACE_ROWS.filter((row) => row.gap).length,
} as const;

export const ASSISTANT_STARTERS = [
  "Summarize the critical findings",
  "Why is DI-038 a gap?",
  "Draft a corrected coverage statement",
] as const;
