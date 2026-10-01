import type { DocumentType, SectionType } from "@/db/schema";
import { chatSectionsInScope } from "@/lib/ai/chat/fields";
import { inScopeEmptyInventoryNeedsReview } from "@/lib/ai/chat/pending-plan";
import {
  prepareReportChatStep,
  type ChatStepDecision,
} from "@/lib/ai/chat/step-policy";
import {
  assembleRulesChatTurnPlan,
  type ChatTurnPlan,
} from "@/lib/ai/chat/turn-plan";

const ADVERTISED_TOOLS = [
  "read_section",
  "list_attachments",
  "search_documents",
  "read_document_page",
  "document_outline",
  "ask_user",
  "draft_field",
  "propose_edit",
  "edit_table",
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
] as const;

const WRITE_TOOLS = new Set([
  "draft_field",
  "propose_edit",
  "edit_table",
]);

function paragraph(text: string) {
  return {
    type: "doc" as const,
    content: [
      {
        type: "paragraph" as const,
        content: [{ type: "text" as const, text }],
      },
    ],
  };
}

function tableDoc(headers: string[], rows: string[][]) {
  const cell = (type: "tableHeader" | "tableCell", text: string) => ({
    type,
    content: [
      {
        type: "paragraph" as const,
        content: [{ type: "text" as const, text }],
      },
    ],
  });
  return {
    type: "doc" as const,
    content: [
      {
        type: "table" as const,
        content: [
          {
            type: "tableRow" as const,
            content: headers.map((header) => cell("tableHeader", header)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: row.map((text) => cell("tableCell", text)),
          })),
        ],
      },
    ],
  };
}

export type HarnessScenarioId =
  | "greeting"
  | "sentence_rewrite"
  | "placeholder_fill"
  | "empty_inventory"
  | "identifier_lookup";

export type HarnessScenario = {
  id: HarnessScenarioId;
  userText: string;
  documentType: DocumentType;
  hasDocuments: boolean;
  totalReadyPages?: number;
  mentionedPageCount?: number;
  sections?: Partial<Record<SectionType, Record<string, unknown>>>;
};

/**
 * Layer-1 F1 scenarios from `docs/harness-plan.md` §13. Live LLM cost/quality
 * still needs a report on the PR; these lock tool availability and retrieval
 * policy so a cheaper change cannot silently reopen a page walk.
 */
export const HARNESS_SCENARIOS: readonly HarnessScenario[] = [
  {
    id: "greeting",
    userText: "hi",
    documentType: "investigation_report",
    hasDocuments: true,
  },
  {
    id: "sentence_rewrite",
    userText: "change the last sentence in Purpose",
    documentType: "design_verification",
    hasDocuments: true,
    sections: {
      purpose_scope: {
        narrative: paragraph(
          "The purpose of this verification is to confirm Solea output energy."
        ),
      },
    },
  },
  {
    id: "placeholder_fill",
    userText: "fill the placeholders in tables 9–11",
    documentType: "equipment_lifecycle_report",
    hasDocuments: true,
    totalReadyPages: 273,
    sections: {
      elr_preventive_maintenance: {
        table: tableDoc(["Document", "Date"], [["PM-EL-12", "<date>"]]),
      },
    },
  },
  {
    id: "empty_inventory",
    userText: "draft Calibration from the attachments",
    documentType: "equipment_lifecycle_report",
    hasDocuments: true,
    totalReadyPages: 273,
    sections: {
      elr_calibration: {
        table: tableDoc(["Instrument", "Certificate"], [["", ""]]),
      },
    },
  },
  {
    id: "identifier_lookup",
    userText: "Where is SW-LWB-4 listed?",
    documentType: "design_verification",
    hasDocuments: true,
    mentionedPageCount: 62,
  },
];

export type HarnessScenarioResult = {
  id: HarnessScenarioId;
  plan: ChatTurnPlan;
  requireInventoryReview: boolean;
  firstStep: ChatStepDecision;
};

function advertisedToolsFor(intent: ChatTurnPlan["intent"]): string[] {
  if (intent === "write") return [...ADVERTISED_TOOLS];
  return ADVERTISED_TOOLS.filter((name) => !WRITE_TOOLS.has(name));
}

export function evaluateHarnessScenario(
  scenario: HarnessScenario
): HarnessScenarioResult {
  const plan = assembleRulesChatTurnPlan({
    userText: scenario.userText,
    documentType: scenario.documentType,
    hasDocuments: scenario.hasDocuments,
    totalReadyPages: scenario.totalReadyPages,
    mentionedPageCount: scenario.mentionedPageCount,
    sections: scenario.sections,
  });
  const sectionKeys = chatSectionsInScope("all", scenario.documentType);
  const requireInventoryReview = inScopeEmptyInventoryNeedsReview({
    documentType: scenario.documentType,
    sections: scenario.sections ?? {},
    sectionKeys,
    finishedCoverageKey: null,
  });
  const firstStep = prepareReportChatStep({
    advertisedTools: advertisedToolsFor(plan.intent),
    steps: [],
    userIntentKind: plan.intent,
    alreadyDrafted: plan.alreadyDrafted !== null,
    hasReadSectionTool: true,
    inScopeHasTable: false,
    retrievalPolicy: plan.retrievalPolicy,
    reviewPhase: "idle",
    requireInventoryReview,
  });
  return {
    id: scenario.id,
    plan,
    requireInventoryReview,
    firstStep,
  };
}

export function evaluateHarnessScenarios(): HarnessScenarioResult[] {
  return HARNESS_SCENARIOS.map(evaluateHarnessScenario);
}
