import {
  generateText,
  stepCountIs,
  tool,
  type LanguageModel,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { buildCriteriaOutline } from "@/lib/ai/chat/criteria-outline";
import {
  evaluateHarnessScenario,
  HARNESS_SCENARIOS,
  type HarnessScenario,
  type HarnessScenarioId,
} from "@/lib/ai/chat/harness-scenarios";
import {
  CHAT_DEEP_GOOGLE_MODEL_ID,
  resolveChatLanguageModel,
} from "@/lib/ai/chat/model";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  callToolName,
  collectToolCalls,
  type SearchLoopStep,
} from "@/lib/ai/chat/search-loop";
import { prepareReportChatStep } from "@/lib/ai/chat/step-policy";
import { buildChatSystemPrompt, CHAT_PROMPT_VERSION } from "@/lib/ai/chat/system-prompt";
import {
  advertisedChatToolNames,
  withUnsupportedChatToolFallback,
} from "@/lib/ai/chat/unsupported-tool";
import { getGeminiAuthDiagnostics } from "@/lib/ai/resolve-google-language-model";
import { ANDREI_BENCH_VERSION } from "@/lib/eval/chat-draft-cases";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { resolveModelFromSpec } from "@/lib/eval/model-resolver";

/** Same-model study cap. First action is enough to score look-before-write. */
export const LIVE_MAX_STEPS = 3;

export const LIVE_MINIMAL_SYSTEM_PROMPT =
  "You are a helpful assistant. You may call tools. Follow the latest user message.";

export const LIVE_WRITE_TOOLS = [
  "draft_field",
  "propose_edit",
  "edit_table",
] as const;

const LIVE_ADVERTISED_TOOLS = [
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

const SEARCH_OR_REVIEW_TOOLS = new Set([
  "search_documents",
  "read_document_page",
  "document_outline",
  "list_attachments",
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
]);

const WRITE_TOOL_SET = new Set<string>(LIVE_WRITE_TOOLS);

const liveToolInputSchema = z.object({
  section: z.string().optional(),
  targetField: z.string().optional(),
  markdown: z.string().optional(),
  queries: z.array(z.string()).optional(),
  filename: z.string().optional(),
  pageNumber: z.number().optional(),
  objective: z.string().optional(),
  operation: z.unknown().optional(),
});

export type LiveAblationArm = "on" | "off";

export type LiveTurnResult = {
  id: HarnessScenarioId;
  arm: LiveAblationArm;
  userText: string;
  text: string;
  toolNames: string[];
  passed: boolean;
  label: string;
  error?: string;
};

export type LiveAblationRow = {
  id: HarnessScenarioId;
  userText: string;
  passCriteria: string;
  on: LiveTurnResult;
  off: LiveTurnResult;
};

export type LiveAblationReport = {
  benchVersion: string;
  promptVersion: string;
  modelLabel: string;
  provider: string;
  usedGemini: boolean;
  n: number;
  correctOn: number;
  correctOff: number;
  rows: LiveAblationRow[];
};

/** Narrow enough for unit mocks. Production uses `generateText` via a cast. */
export type LiveGenerateTextFn = (args: {
  model: LanguageModel;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  tools: ToolSet;
  activeTools: readonly string[];
  experimental_repairToolCall?: typeof repairChatToolCall;
  stopWhen?: unknown;
  maxOutputTokens?: number;
  allowSystemInMessages?: boolean;
  providerOptions?: unknown;
  prepareStep?: (opts: { steps: SearchLoopStep[] }) => {
    activeTools: readonly string[];
    toolChoice?: unknown;
  };
}) => Promise<{
  text?: string;
  steps?: SearchLoopStep[];
  toolCalls?: Array<{ toolName: string }>;
}>;

function stubTools(): ToolSet {
  const make = (name: string, description: string): ToolSet[string] =>
    tool({
      description,
      inputSchema: liveToolInputSchema,
      execute: async (input) => ({ ok: true, tool: name, received: input ?? {} }),
    });

  return {
    read_section: make("read_section", "Read the current report section JSON."),
    list_attachments: make(
      "list_attachments",
      "List attached files (filename, type, ready status)."
    ),
    search_documents: make(
      "search_documents",
      "Grep attached PDF/Word text. Pass queries[]."
    ),
    read_document_page: make(
      "read_document_page",
      "Read one attachment page. Pass filename and pageNumber."
    ),
    document_outline: make("document_outline", "Outline headings in an attachment."),
    ask_user: make("ask_user", "Ask the engineer a structured question."),
    start_document_review: make(
      "start_document_review",
      "Start a complete page walk of attached files."
    ),
    continue_document_review: make(
      "continue_document_review",
      "Continue an in-progress page walk."
    ),
    finish_document_review: make(
      "finish_document_review",
      "Finish a page walk and return findings."
    ),
    draft_field: make("draft_field", "Write a report field. Pass section, targetField, markdown."),
    propose_edit: make("propose_edit", "Propose an edit to existing report text."),
    edit_table: make("edit_table", "Edit a report table. Pass section and operation."),
  };
}

function contextMapFor(scenario: HarnessScenario): string {
  const pages = scenario.totalReadyPages ?? 40;
  const docs = scenario.hasDocuments
    ? `Documents: 3 ready PDFs (${String(pages)} pages). Calibration-certificate.pdf, URS.pdf, IQ-protocol.pdf.`
    : "Documents: none.";
  switch (scenario.id) {
    case "greeting":
      return `${docs}\nEmpty investigation report. Purpose, Measure, Analyze are blank.`;
    case "sentence_rewrite":
      return `${docs}\nPurpose & Scope narrative: "The purpose of this verification is to confirm Solea output energy."`;
    case "placeholder_fill":
      return `${docs}\nPreventive maintenance table: Document=PM-EL-12, Date=<date>.`;
    case "empty_inventory":
      return `${docs}\nCalibration table headers Instrument | Certificate. One blank row. No review has finished.`;
    case "identifier_lookup":
      return `${docs}\nDesign verification. Requirements mention SW-LWB-4 on an attached protocol.`;
    default: {
      const neverId: never = scenario.id;
      throw new Error(`unhandled harness scenario ${String(neverId)}`);
    }
  }
}

function advertisedToolsFor(intent: "social" | "read" | "write"): string[] {
  if (intent === "write") return [...LIVE_ADVERTISED_TOOLS];
  return LIVE_ADVERTISED_TOOLS.filter(
    (name) => !WRITE_TOOL_SET.has(name)
  );
}

export function toolNamesFromGenerateResult(result: {
  steps?: readonly SearchLoopStep[];
  toolCalls?: readonly { toolName?: string; tool?: string; type?: string }[];
}): string[] {
  const names: string[] = [];
  for (const step of result.steps ?? []) {
    for (const call of collectToolCalls(step)) {
      const name = callToolName(call);
      if (name) names.push(name);
    }
  }
  if (names.length === 0) {
    for (const call of result.toolCalls ?? []) {
      const name = callToolName(call);
      if (name) names.push(name);
    }
  }
  return names;
}

export function scoreLiveHarnessTools(
  scenarioId: HarnessScenarioId,
  toolNames: readonly string[]
): { passed: boolean; label: string } {
  const wrote = toolNames.some((name) => WRITE_TOOL_SET.has(name));
  const searchedOrReviewed = toolNames.some((name) =>
    SEARCH_OR_REVIEW_TOOLS.has(name)
  );
  const startedReview = toolNames.includes("start_document_review");
  const firstWrite = toolNames.find((name) => WRITE_TOOL_SET.has(name));
  const writeAfterReview =
    Boolean(firstWrite) &&
    startedReview &&
    toolNames.indexOf("start_document_review") < toolNames.indexOf(firstWrite!);

  switch (scenarioId) {
    case "greeting": {
      const passed = !wrote && !searchedOrReviewed;
      return {
        passed,
        label: passed ? "stayed quiet" : wrote ? "wrote on hello" : "searched on hello",
      };
    }
    case "empty_inventory": {
      const passed = startedReview && (!wrote || writeAfterReview);
      return {
        passed,
        label: passed
          ? "reviewed files first"
          : wrote
            ? "wrote into empty table"
            : "skipped the review",
      };
    }
    case "sentence_rewrite": {
      const passed = !startedReview;
      return {
        passed,
        label: passed ? "edited the sentence" : "started a page walk",
      };
    }
    case "placeholder_fill": {
      const passed = !startedReview;
      return {
        passed,
        label: passed ? "filled placeholders" : "started a page walk",
      };
    }
    case "identifier_lookup": {
      const passed = !wrote && !startedReview;
      return {
        passed,
        label: passed ? "looked up the id" : wrote ? "wrote first" : "started a page walk",
      };
    }
    default: {
      const neverId: never = scenarioId;
      throw new Error(`unhandled harness scenario ${String(neverId)}`);
    }
  }
}

function passCriteriaFor(id: HarnessScenarioId): string {
  switch (id) {
    case "greeting":
      return "A hello must not search, review, or write.";
    case "empty_inventory":
      return "An empty inventory table must start a file review before any write.";
    case "sentence_rewrite":
      return "Rewriting a filled sentence must not start a document review.";
    case "placeholder_fill":
      return "Filling placeholders in a populated table must not start a document review.";
    case "identifier_lookup":
      return "Looking up one identifier must not write or start a page walk.";
    default: {
      const neverId: never = id;
      throw new Error(`unhandled harness scenario ${String(neverId)}`);
    }
  }
}

function reviewPhaseFromTools(toolNames: readonly string[]):
  | "idle"
  | "in_progress"
  | "ready_to_finish"
  | "complete" {
  if (toolNames.includes("finish_document_review")) return "complete";
  if (
    toolNames.includes("start_document_review") ||
    toolNames.includes("continue_document_review")
  ) {
    return "in_progress";
  }
  return "idle";
}

function vertexAuthIsUsable(): boolean {
  const diag = getGeminiAuthDiagnostics();
  if (!diag.hasVertexConfig) return false;
  if (diag.hasWifConfig) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  return false;
}

export function resolveLiveEvalModel(): {
  model: LanguageModel;
  label: string;
  provider: string;
  usedGemini: boolean;
} {
  const diag = getGeminiAuthDiagnostics();
  if (diag.hasGoogleKey || diag.hasGatewayKey || vertexAuthIsUsable()) {
    return {
      model: resolveChatLanguageModel("deep"),
      label: CHAT_DEEP_GOOGLE_MODEL_ID,
      provider: vertexAuthIsUsable()
        ? "vertex"
        : diag.hasGoogleKey
          ? "google"
          : "gateway",
      usedGemini: true,
    };
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      model: resolveModelFromSpec({
        provider: "openai",
        modelId: "gpt-4.1-mini",
      }),
      label: "gpt-4.1-mini",
      provider: "openai",
      usedGemini: false,
    };
  }
  throw new Error(
    "Live ablation needs Gemini (GOOGLE_VERTEX_PROJECT plus ADC or WIF, GOOGLE_GENERATIVE_AI_API_KEY, or AI_GATEWAY_API_KEY). OPENAI_API_KEY is an emergency same-model fallback only."
  );
}

export async function runLiveHarnessTurn(opts: {
  scenario: HarnessScenario;
  arm: LiveAblationArm;
  model: LanguageModel;
  generateTextFn?: LiveGenerateTextFn;
  provider?: string;
}): Promise<LiveTurnResult> {
  const generate =
    opts.generateTextFn ?? (generateText as unknown as LiveGenerateTextFn);
  const evaluated = evaluateHarnessScenario(opts.scenario);
  const tools = withUnsupportedChatToolFallback(stubTools());
  const advertised =
    opts.arm === "off"
      ? advertisedChatToolNames(tools)
      : advertisedToolsFor(evaluated.plan.intent);

  const system =
    opts.arm === "on"
      ? buildChatSystemPrompt({
          contextMap: contextMapFor(opts.scenario),
          criteriaOutline: buildCriteriaOutline(
            "all",
            opts.scenario.documentType
          ),
          mode: "agent",
          documentType: opts.scenario.documentType,
          alreadyDrafted: evaluated.plan.alreadyDrafted,
          retrievalPolicy: evaluated.plan.retrievalPolicy,
          intent: evaluated.plan.intent,
          includePlotMeasurements: false,
        })
      : LIVE_MINIMAL_SYSTEM_PROMPT;

  const firstActive =
    opts.arm === "off" ? advertised : evaluated.firstStep.activeTools;

  const providerOptions =
    opts.provider === "openai"
      ? undefined
      : buildGeminiThoughtSummaryProviderOptions({
          thinkingLevel: "minimal",
          includeThoughts: false,
        });

  try {
    const result = await generate({
      model: opts.model,
      system,
      messages: [{ role: "user", content: opts.scenario.userText }],
      tools,
      activeTools: firstActive,
      experimental_repairToolCall: repairChatToolCall,
      stopWhen: stepCountIs(LIVE_MAX_STEPS),
      maxOutputTokens: 1024,
      allowSystemInMessages: false,
      providerOptions,
      prepareStep:
        opts.arm === "off"
          ? undefined
          : ({ steps }) => {
              const toolNames = toolNamesFromGenerateResult({
                steps: steps as SearchLoopStep[],
              });
              const decision = prepareReportChatStep({
                advertisedTools: advertised,
                steps: steps as SearchLoopStep[],
                userIntentKind: evaluated.plan.intent,
                alreadyDrafted: evaluated.plan.alreadyDrafted !== null,
                hasReadSectionTool: true,
                inScopeHasTable: opts.scenario.id === "empty_inventory" ||
                  opts.scenario.id === "placeholder_fill",
                retrievalPolicy: evaluated.plan.retrievalPolicy,
                reviewPhase: reviewPhaseFromTools(toolNames),
                requireInventoryReview: evaluated.requireInventoryReview,
              });
              return {
                activeTools: decision.activeTools,
                toolChoice: decision.toolChoice,
              };
            },
    });
    const toolNames = toolNamesFromGenerateResult(result);
    const scored = scoreLiveHarnessTools(opts.scenario.id, toolNames);
    return {
      id: opts.scenario.id,
      arm: opts.arm,
      userText: opts.scenario.userText,
      text: result.text ?? "",
      toolNames,
      passed: scored.passed,
      label: scored.label,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: opts.scenario.id,
      arm: opts.arm,
      userText: opts.scenario.userText,
      text: "",
      toolNames: [],
      passed: false,
      label: "errored",
      error: message,
    };
  }
}

export async function runLiveAblation(opts?: {
  generateTextFn?: LiveGenerateTextFn;
  model?: LanguageModel;
  modelLabel?: string;
  provider?: string;
  usedGemini?: boolean;
  scenarios?: readonly HarnessScenario[];
}): Promise<LiveAblationReport> {
  const resolved =
    opts?.model && opts.modelLabel && opts.provider
      ? {
          model: opts.model,
          label: opts.modelLabel,
          provider: opts.provider,
          usedGemini: opts.usedGemini ?? false,
        }
      : resolveLiveEvalModel();
  const scenarios = opts?.scenarios ?? HARNESS_SCENARIOS;
  const rows: LiveAblationRow[] = [];
  for (const scenario of scenarios) {
    const on = await runLiveHarnessTurn({
      scenario,
      arm: "on",
      model: resolved.model,
      generateTextFn: opts?.generateTextFn,
      provider: resolved.provider,
    });
    const off = await runLiveHarnessTurn({
      scenario,
      arm: "off",
      model: resolved.model,
      generateTextFn: opts?.generateTextFn,
      provider: resolved.provider,
    });
    rows.push({
      id: scenario.id,
      userText: scenario.userText,
      passCriteria: passCriteriaFor(scenario.id),
      on,
      off,
    });
  }
  return {
    benchVersion: ANDREI_BENCH_VERSION,
    promptVersion: CHAT_PROMPT_VERSION,
    modelLabel: resolved.label,
    provider: resolved.provider,
    usedGemini: resolved.usedGemini,
    n: rows.length,
    correctOn: rows.filter((row) => row.on.passed).length,
    correctOff: rows.filter((row) => row.off.passed).length,
    rows,
  };
}

export function formatLiveAblationReport(report: LiveAblationReport): string {
  const modelLine = report.usedGemini
    ? `model=${report.modelLabel} (${report.provider})`
    : `model=${report.modelLabel} (${report.provider}; Gemini ADC missing — not a Gemini number)`;
  const lines = [
    `live look-before-write ablation  bench=${report.benchVersion}  ${modelLine}  prompt=${report.promptVersion}  n=${String(report.n)}`,
    "",
    "id".padEnd(22) + "user".padEnd(42) + "on".padEnd(28) + "off",
    "-".repeat(110),
  ];
  for (const row of report.rows) {
    lines.push(
      `${row.id.padEnd(22)}${row.userText.slice(0, 40).padEnd(42)}${row.on.label.padEnd(28)}${row.off.label}`
    );
    if (row.on.error) lines.push(`  on error: ${row.on.error}`);
    if (row.off.error) lines.push(`  off error: ${row.off.error}`);
    const onTools =
      row.on.toolNames.length > 0 ? row.on.toolNames.join(", ") : "(no tools)";
    const offTools =
      row.off.toolNames.length > 0 ? row.off.toolNames.join(", ") : "(no tools)";
    lines.push(`  tools on: ${onTools}`);
    lines.push(`  tools off: ${offTools}`);
  }
  lines.push("-".repeat(110));
  lines.push(
    `looked before writing  Andrei on ${String(report.correctOn)}/${String(report.n)}   base model ${String(report.correctOff)}/${String(report.n)}`
  );
  lines.push(
    "Same model both arms. Andrei on = current system prompt + step policy. Base = minimal system prompt + every write tool advertised. Not the persist 14/14. Not the policy-stub 6/6 vs 1/6. Page-plan and title-list rows are not LLM turns."
  );
  if (!report.usedGemini) {
    lines.push(
      "This VM could not call Gemini (no Vertex ADC / WIF / Studio / Gateway key). Quote these counts only as the OpenAI stand-in; re-run with Gemini credentials for the sales Gemini number."
    );
  }
  return lines.join("\n");
}
