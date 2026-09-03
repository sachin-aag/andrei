export type ProofreadSeverity = "grammar" | "tone";

export type ProofreadSkipReason =
  | "budget"
  | "rate_limit"
  | "read_only"
  | "unavailable"
  | "empty";

export type ProofreadUnit = {
  id: string;
  text: string;
};

export type ProofreadIssue = {
  id: string;
  unitId: string;
  unitHash: string;
  severity: ProofreadSeverity;
  deleteText: string;
  insertText: string;
  anchorText: string;
  label: string;
};

export type ProofreadResult = {
  issues: ProofreadIssue[];
  skipped?: ProofreadSkipReason;
};
