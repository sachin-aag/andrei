import path from "node:path";
import { COMMON_EVALUATION_SYSTEM_PROMPT } from "@/lib/ai/section-prompts";
import type { DocumentTypeDefinition, SectionDefinition } from "./types";
import { det, llm } from "./criterion-helpers";
import {
  checkCoverPageIdentity,
  checkCoverPageProduct,
} from "./design-verification/deterministic-checks";
import { asLedger } from "./verification-protocol/sections";
import { checkRequirementsVerifiedGenerated } from "./verification-test-report/deterministic-checks";
import {
  EMPTY_TEST_REPORT_CONTENT,
  REVISION_HISTORY_HEADERS,
  SOFTWARE_UNDER_TEST_HEADERS,
  TEST_REPORT_COVER_PAGE_SECTION,
  TEST_REPORT_SECTION_LABELS,
  asTestReportDeviations,
  asTestReportMethods,
  asTestReportNarrative,
  asTestReportResults,
  asTestReportTable,
  type TestReportSectionKey,
} from "./verification-test-report/sections";

const TEST_REPORT_BASE_PROMPT = `${COMMON_EVALUATION_SYSTEM_PROMPT}

You are reviewing a software/firmware verification test report. Grade heading-level completeness: purpose, scope, software-under-test identity, deviation disposition, and conclusion. Do not invent pass/fail results. Requirements Verified is generated from the design-input ledger and is out of scope for LLM grading.`;

function testReportSection(
  key: TestReportSectionKey,
  order: number,
  opts: Pick<SectionDefinition, "editable" | "evaluable">
): SectionDefinition {
  return {
    key,
    label: TEST_REPORT_SECTION_LABELS[key],
    order,
    editable: opts.editable,
    evaluable: opts.evaluable,
    emptyContent: EMPTY_TEST_REPORT_CONTENT[key],
  };
}

function mergeTestReportSection(key: string, raw: unknown): unknown {
  switch (key as TestReportSectionKey) {
    case "design_inputs":
      return asLedger(raw);
    case "purpose":
    case "scope":
    case "testers_dates":
    case "problem_failure_resolution":
    case "conclusion":
      return asTestReportNarrative(raw);
    case "software_under_test":
      return asTestReportTable(raw, SOFTWARE_UNDER_TEST_HEADERS);
    case "revision_history":
      return asTestReportTable(raw, REVISION_HISTORY_HEADERS);
    case "methods_of_measurement":
      return asTestReportMethods(raw);
    case "deviations":
      return asTestReportDeviations(raw);
    case "results_discussion":
      return asTestReportResults(raw);
    default:
      return raw ?? {};
  }
}

export const verificationTestReportDefinition: DocumentTypeDefinition = {
  key: "verification_test_report",
  label: "Verification Test Report",
  documentNoun: "verification test report",
  documentNoLabel: "Document Number",
  sections: [
    {
      key: TEST_REPORT_COVER_PAGE_SECTION,
      label: TEST_REPORT_SECTION_LABELS.cover_page,
      order: 0,
      editable: true,
      evaluable: true,
      virtual: false,
      isGateSection: true,
      emptyContent: {},
    },
    testReportSection("design_inputs", 1, {
      editable: false,
      evaluable: false,
    }),
    testReportSection("purpose", 2, { editable: true, evaluable: true }),
    testReportSection("scope", 3, { editable: true, evaluable: true }),
    testReportSection("software_under_test", 4, {
      editable: true,
      evaluable: true,
    }),
    testReportSection("testers_dates", 5, { editable: true, evaluable: false }),
    testReportSection("methods_of_measurement", 6, {
      editable: true,
      evaluable: false,
    }),
    testReportSection("deviations", 7, { editable: true, evaluable: true }),
    testReportSection("results_discussion", 8, {
      editable: true,
      evaluable: true,
    }),
    testReportSection("problem_failure_resolution", 9, {
      editable: true,
      evaluable: false,
    }),
    testReportSection("conclusion", 10, { editable: true, evaluable: true }),
    testReportSection("revision_history", 11, {
      editable: true,
      evaluable: false,
    }),
  ],
  criteriaBySection: {
    cover_page: [
      det(
        "cover.document_control",
        "Document has unique ID and revision number",
        "Confirm unique ID and revision are populated.",
        checkCoverPageIdentity
      ),
      det(
        "cover.product_identity",
        "Product name identified",
        "Confirm the product name field is populated.",
        checkCoverPageProduct
      ),
    ],
    purpose: [
      llm(
        "purpose.stated",
        "Purpose of the verification activity is stated",
        "The purpose section states why this verification activity is being performed."
      ),
    ],
    scope: [
      llm(
        "scope.configurations",
        "Scope names the system configurations under test",
        "The scope names the system configurations included in this verification activity."
      ),
    ],
    software_under_test: [
      llm(
        "software_under_test.version_reason",
        "Software under test lists version and reason for build",
        "The software-under-test table lists each version and the reason for that build."
      ),
    ],
    deviations: [
      llm(
        "deviations.disposition",
        "Each deviation has observation, rationale, and resolution",
        "Each recorded deviation includes an observation, a rationale, and a resolution or disposition."
      ),
    ],
    results_discussion: [
      det(
        "results_discussion.requirements_verified",
        "Requirements Verified is generated from the ledger and complete for live requirements",
        "The Requirements Verified table is generated from the design-input ledger, includes a row for every live requirement, has no pass/fail column, and does not use a typed modification count.",
        checkRequirementsVerifiedGenerated,
        ["design_inputs", "methods_of_measurement"]
      ),
    ],
    conclusion: [
      llm(
        "conclusion.present",
        "Conclusion states whether design inputs were verified",
        "The conclusion states whether the design inputs in scope were verified."
      ),
    ],
  },
  prompts: {
    base: TEST_REPORT_BASE_PROMPT,
    perSection: {
      purpose:
        "SECTION ROLE - PURPOSE: Judge whether the verification activity’s purpose is stated.",
      scope:
        "SECTION ROLE - SCOPE: Judge whether the configurations under test are named.",
      software_under_test:
        "SECTION ROLE - SOFTWARE UNDER TEST: Judge whether version and reason for build are listed.",
      deviations:
        "SECTION ROLE - DEVIATIONS: Judge whether each deviation has observation, rationale, and resolution.",
      conclusion:
        "SECTION ROLE - CONCLUSION: Judge whether the conclusion states that design inputs were verified.",
    },
    promptVersion: "convergent-test-report-v1",
  },
  chat: {
    persona:
      "You help draft a verification test report. Do not invent pass/fail results. Requirements Verified is generated from the ledger.",
    draftOrder: [
      "purpose",
      "scope",
      "software_under_test",
      "deviations",
      "conclusion",
    ],
    sectionIntentPatterns: [
      ["purpose", [/\bpurpose\b/i]],
      ["scope", [/\bscope\b/i, /\bconfiguration/i]],
      ["software_under_test", [/\bsoftware under test\b/i, /\bversion\b/i]],
      ["deviations", [/\bdeviation/i]],
      ["conclusion", [/\bconclusion\b/i]],
    ],
  },
  suggestTargetFieldPatterns: {
    purpose: ["narrative"],
    scope: ["narrative"],
    software_under_test: ["table"],
    testers_dates: ["narrative"],
    methods_of_measurement: ["executedProtocol", "uuts", "equipment"],
    conclusion: ["narrative"],
    problem_failure_resolution: ["narrative"],
    results_discussion: ["observations"],
    revision_history: ["table"],
  },
  richFieldPaths: {
    purpose: ["narrative"],
    scope: ["narrative"],
    software_under_test: ["table"],
    testers_dates: ["narrative"],
    methods_of_measurement: ["executedProtocol", "uuts", "equipment"],
    conclusion: ["narrative"],
    problem_failure_resolution: ["narrative"],
    results_discussion: ["observations"],
    revision_history: ["table"],
  },
  mergeSection: mergeTestReportSection,
  export: {
    templatePath: path.join(
      process.cwd(),
      "templates",
      "convergent-test-report-template.docx"
    ),
    buildTemplateData: () => ({}),
  },
  defaultMetadata: {
    revision: "",
    productName: "",
    projectName: "",
    dhfIndex: "",
    projectLeader: "",
    ecoDco: "",
  },
};
