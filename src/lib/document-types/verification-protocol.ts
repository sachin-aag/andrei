import { COMMON_EVALUATION_SYSTEM_PROMPT } from "@/lib/ai/section-prompts";
import type { DocumentTypeDefinition, SectionDefinition } from "./types";
import { det } from "./criterion-helpers";
import {
  checkFindingsCriterion,
  checkSourcesIdentity,
} from "./verification-protocol/criteria-adapter";
import {
  EMPTY_PROTOCOL_CONTENT,
  PROTOCOL_SECTION_KEYS,
  PROTOCOL_SECTION_LABELS,
  asFindings,
  asLedger,
  asModificationRegister,
  asSources,
  type ProtocolSectionKey,
} from "./verification-protocol/sections";

const FINDINGS_CRITERIA = [
  det(
    "findings.ids_resolve",
    "Every cited requirement ID resolves in the stated SRS revision",
    "Every requirement identifier cited in the protocol or SRS text must exist in the stated software-requirements revision. Unresolved citations are defects.",
    checkFindingsCriterion("findings.ids_resolve")
  ),
  det(
    "findings.live_coverage",
    "Every live, non-deferred requirement is tested or has a documented out-of-scope rationale",
    "Every live requirement that is not deferred to a future release must have a test method or a documented rationale taking it out of scope.",
    checkFindingsCriterion("findings.live_coverage")
  ),
  det(
    "findings.claimed_vs_tested",
    "Claimed coverage matches actual test rows",
    "IDs listed in a block’s requirements table or coverage banner must appear in that block’s test-method rows. Duplicate coverage-banner entries are queued for review.",
    checkFindingsCriterion("findings.claimed_vs_tested")
  ),
  det(
    "findings.obsolete_absent",
    "Removed requirement IDs do not reappear as live coverage",
    "IDs marked removed in the SRS must not reappear as live protocol coverage (declared without a removal marker, listed on a coverage banner, or assigned a test row). Tombstone rows that only record the removal are documentation, not defects.",
    checkFindingsCriterion("findings.obsolete_absent")
  ),
  det(
    "findings.applicability_vs_plan",
    "Requirement applicability notes agree with the plan’s configuration codes",
    "When a requirement states an applicability restriction, the verification plan’s configuration code must not require configurations outside that restriction. Recorded confirmation against a known revision skew is partial, not a pass.",
    checkFindingsCriterion("findings.applicability_vs_plan")
  ),
  det(
    "findings.one_config_code",
    "One configuration code per requirement per plan revision",
    "A requirement must not carry two different configuration codes across plan releases unless a narrowing rationale is recorded.",
    checkFindingsCriterion("findings.one_config_code")
  ),
  det(
    "findings.equipment_listed",
    "Instruments named in methods appear in the equipment table",
    "Every instrument named in a test method must appear in the protocol equipment table.",
    checkFindingsCriterion("findings.equipment_listed")
  ),
  det(
    "findings.quantitative_tolerance",
    "Quantitative expected results have a tolerance, not an approximation",
    "Numeric expected results must state a tolerance. Approximations are queued for review rather than failed automatically.",
    checkFindingsCriterion("findings.quantitative_tolerance")
  ),
  det(
    "findings.normative_language",
    "Non-normative or discretionary language is queued for review",
    "Discretionary phrasing in methods (N/A, should, if needed, unmeasurable qualifiers) is a review queue, not a wall of defects.",
    checkFindingsCriterion("findings.normative_language")
  ),
  det(
    "findings.sample_size",
    "Sample size or per-configuration execution is stated",
    "Methods must make sample size or per-configuration execution explicit rather than implying it from a single UUT cell.",
    checkFindingsCriterion("findings.sample_size")
  ),
];

function protocolSection(
  key: ProtocolSectionKey,
  order: number,
  opts: Pick<SectionDefinition, "editable" | "evaluable" | "isGateSection">
): SectionDefinition {
  return {
    key,
    label: PROTOCOL_SECTION_LABELS[key],
    order,
    editable: opts.editable,
    evaluable: opts.evaluable,
    isGateSection: opts.isGateSection,
    emptyContent: EMPTY_PROTOCOL_CONTENT[key],
  };
}

function mergeProtocolSection(key: string, raw: unknown): unknown {
  switch (key as ProtocolSectionKey) {
    case "sources":
      return asSources(raw);
    case "design_inputs":
      return asLedger(raw);
    case "findings":
      return asFindings(raw);
    case "modification_register":
      return asModificationRegister(raw);
    default:
      return raw ?? {};
  }
}

export const verificationProtocolDefinition: DocumentTypeDefinition = {
  key: "verification_protocol",
  label: "Verification Protocol",
  documentNoun: "verification protocol",
  documentNoLabel: "Document Number",
  sections: [
    protocolSection("sources", 0, {
      editable: true,
      evaluable: true,
      isGateSection: true,
    }),
    protocolSection("design_inputs", 1, {
      editable: false,
      evaluable: false,
    }),
    protocolSection("findings", 2, {
      editable: false,
      evaluable: true,
    }),
    protocolSection("modification_register", 3, {
      editable: true,
      evaluable: false,
    }),
  ],
  criteriaBySection: {
    sources: [
      det(
        "sources.identity",
        "Protocol, SRS, and plan identified by document number and revision",
        "The protocol, software-requirements specification, and verification test plan are each identified by document number and revision before evaluation runs.",
        checkSourcesIdentity
      ),
    ],
    findings: FINDINGS_CRITERIA,
  },
  prompts: {
    base: COMMON_EVALUATION_SYSTEM_PROMPT,
    perSection: {},
    promptVersion: "verification-protocol-v1",
  },
  chat: {
    persona:
      "Chat drafting is not available for verification protocols. Use Run Check on the ingested sources.",
    draftOrder: PROTOCOL_SECTION_KEYS.filter((key) => key === "sources"),
    sectionIntentPatterns: [
      ["sources", [/\bsources?\b/i, /\bprotocol\b/i, /\bSRS\b/, /\btest plan\b/i]],
    ],
  },
  suggestTargetFieldPatterns: {},
  richFieldPaths: {},
  mergeSection: mergeProtocolSection,
  export: {
    templatePath: "",
    buildTemplateData: () => ({}),
  },
  defaultMetadata: { revision: "" },
};
