/** Static mock data for Insights demo pages — aligned with seeded report deviation numbers. */

export const DEMO_REPORT_SUMMARIES = [
  {
    id: "dev-001",
    deviationNo: "DEV-2026-001",
    title: "HPLC peak tailing during release testing",
    status: "draft",
    procedure: "Analytical testing",
    daysOpen: 12,
    collaborators: 3,
  },
  {
    id: "dev-002",
    deviationNo: "DEV-2026-002",
    title: "Temperature excursion in stability chamber",
    status: "submitted",
    procedure: "Stability operations",
    daysOpen: 28,
    collaborators: 4,
  },
  {
    id: "dev-003",
    deviationNo: "DEV-2026-003",
    title: "Label artwork version mismatch",
    status: "in_review",
    procedure: "Packaging & labeling",
    daysOpen: 45,
    collaborators: 5,
  },
  {
    id: "dev-004",
    deviationNo: "DEV-2026-004",
    title: "Cleaning verification failure",
    status: "approved",
    procedure: "Equipment cleaning",
    daysOpen: 18,
    collaborators: 2,
  },
  {
    id: "dev-005",
    deviationNo: "DEV-2026-005",
    title: "Data integrity audit trail gap",
    status: "draft",
    procedure: "Computerized systems",
    daysOpen: 5,
    collaborators: 3,
  },
] as const;

export const STATUS_COUNTS = {
  draft: 2,
  submitted: 1,
  in_review: 1,
  approved: 1,
  feedback: 0,
} as const;

export const AVG_CLOSURE_DAYS = 23;

export const PITFALLS_BY_PROCEDURE = [
  {
    procedure: "Analytical testing",
    gaps: [
      { label: "Incomplete experiment traceability", count: 8 },
      { label: "Missing regulatory notification rationale", count: 5 },
      { label: "Weak measure-to-analyze linkage", count: 4 },
    ],
  },
  {
    procedure: "Stability operations",
    gaps: [
      { label: "Impact assessment not time-bounded", count: 6 },
      { label: "CAPA effectiveness not defined", count: 5 },
    ],
  },
  {
    procedure: "Packaging & labeling",
    gaps: [
      { label: "Document version control gaps", count: 7 },
      { label: "Disposition rationale incomplete", count: 4 },
    ],
  },
  {
    procedure: "Equipment cleaning",
    gaps: [
      { label: "Hold time not documented", count: 3 },
      { label: "Verification method unclear", count: 3 },
    ],
  },
  {
    procedure: "Computerized systems",
    gaps: [
      { label: "Audit trail review incomplete", count: 9 },
      { label: "Change control cross-reference missing", count: 6 },
    ],
  },
] as const;

export const DOC_INSIGHT_CARDS = [
  {
    id: "checklist-density",
    title: "Checklist density",
    description: "Measures how much template guidance remains vs. author narrative.",
    enabled: true,
  },
  {
    id: "criteria-pass-rate",
    title: "Criteria pass rate",
    description: "Share of AI criteria marked met on last evaluation run.",
    enabled: true,
  },
  {
    id: "section-latency",
    title: "Section edit latency",
    description: "Average days between first and last save per section.",
    enabled: false,
  },
  {
    id: "reviewer-comments",
    title: "Reviewer comment themes",
    description: "Clusters open manager comments by section and criterion.",
    enabled: false,
  },
] as const;

export const MANAGEMENT_REPORT_ROWS = [
  ...DEMO_REPORT_SUMMARIES,
  {
    id: "dev-006",
    deviationNo: "DEV-2026-006",
    title: "Raw material COA discrepancy",
    status: "submitted" as const,
    procedure: "Incoming materials",
    daysOpen: 14,
    collaborators: 2,
  },
  {
    id: "dev-007",
    deviationNo: "DEV-2026-007",
    title: "Environmental monitoring alert",
    status: "in_review" as const,
    procedure: "Facilities",
    daysOpen: 9,
    collaborators: 3,
  },
  {
    id: "dev-008",
    deviationNo: "DEV-2026-008",
    title: "Training record gap",
    status: "draft" as const,
    procedure: "Personnel qualification",
    daysOpen: 21,
    collaborators: 2,
  },
  {
    id: "dev-009",
    deviationNo: "DEV-2026-009",
    title: "Batch record transcription error",
    status: "approved" as const,
    procedure: "Manufacturing",
    daysOpen: 11,
    collaborators: 4,
  },
  {
    id: "dev-010",
    deviationNo: "DEV-2026-010",
    title: "Supplier deviation notification delay",
    status: "feedback" as const,
    procedure: "Supplier quality",
    daysOpen: 32,
    collaborators: 3,
  },
];
