export type Requirement = {
  id: string;
  text: string;
  family: string;
  removedInRev: string | null;
  deferred: boolean;
  applicabilityNote: string | null;
};

export type ScopeEntry = {
  reqId: string;
  release: string;
  jCode: string;
  requiredConfigs: string[];
};

export type TildeHit = { page: number; quote: string };

export type NonNormativeHits = {
  na: number;
  should: number;
  ifNeeded: number;
  appropriate: number;
};

export type TestMethodBlock = {
  id: string;
  title: string;
  pages: { start: number; end: number };
  declaredReqIds: string[];
  bannerReqIds: string[];
  bannerDuplicateIds: string[];
  testedReqIds: string[];
  tildeHits: TildeHit[];
  nonNormativeHits: NonNormativeHits;
  instrumentsNamed: string[];
};

export type Ledger = {
  requirements: Requirement[];
  scope: ScopeEntry[];
  blocks: TestMethodBlock[];
  equipmentTable: string[];
  referencesTable: string[];
};

export type FindingDisposition =
  | "defect"
  | "needs_confirmation"
  | "review_queue"
  | "clean";

export type EvidenceDoc = string;

export type FindingEvidence = {
  doc: EvidenceDoc;
  rev: string;
  page: number;
  quote: string;
};

export type ModificationRow = {
  findingId: string;
  blockId: string | null;
  kind: "added" | "modified" | "removed";
  target: "protocol" | "plan" | "srs" | "equipment_table";
  before: string;
  after: string;
  rationale: string;
  status: "proposed" | "accepted" | "dismissed";
};

export type Finding = {
  id: string;
  check: string;
  severity: "high" | "medium" | "low";
  disposition: FindingDisposition;
  reqIds: string[];
  evidence: FindingEvidence[];
  corroboratedBy?: { doc: string; quote: string };
  questions: string[];
  sopRefs: string[];
  proposedFix: ModificationRow | null;
};

export type SourcesContent = {
  protocolNo: string;
  protocolRev: string;
  srsNo: string;
  srsRev: string;
  planNo: string;
  planRev: string;
};

export type FindingsContent = {
  items: Finding[];
};

export type ModificationRegisterContent = {
  rows: ModificationRow[];
};

/** Customer overlay: how this family's PDFs are shaped. Not a criterion. */
export type ApplicabilityRule = {
  pattern: RegExp;
  impliedConfigs: string[];
};

export type ProtocolParserConfig = {
  requirementId: RegExp;
  requirementIdLine: RegExp;
  family: RegExp;
  removed: RegExp;
  deferred: RegExp;
  revHistoryMarker: string;
  applicabilityRules: ApplicabilityRule[];
  plan: {
    releaseHeadings: Array<{ release: string; heading: RegExp }>;
    firmwareStop: RegExp;
    jCodeLineEnd: RegExp;
    ignoreLine?: RegExp;
    requiredConfigsFor: (jCode: string) => string[];
  };
  protocol: {
    requirementsMarker: RegExp;
    testingMethodsMarker: RegExp;
    sectionEndMarker: RegExp;
    titleBeforeRequirements: boolean;
    documentNoPattern: RegExp;
  };
  instrumentLexicon: readonly string[];
  tilde: RegExp;
  nonNormative: {
    na: RegExp;
    should: RegExp;
    ifNeeded: RegExp;
    appropriate: RegExp;
  };
};

export type ProtocolCheckPolicy = {
  /** Applicability mismatches that stay confirmation, not defect, for this revision set. */
  confirmationIds: ReadonlySet<string>;
  corroborations: Readonly<Record<string, { doc: string; quote: string }>>;
};
