import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { groundDraftText } from "@/lib/ai/chat/ground-draft";
import {
  evaluateHarnessScenario,
  HARNESS_SCENARIOS,
  type HarnessScenarioId,
} from "@/lib/ai/chat/harness-scenarios";
import { annotateIdentityIncompleteSearchHits } from "@/lib/ai/chat/identity-incomplete-hits";
import {
  coverageKeySatisfiesObjective,
  coverageObjectiveDigest,
  isQsrLifecycleCoverObjective,
  isQsrUrsWalkObjective,
  qsrReviewPagePlan,
  type QsrReviewPagePlan,
} from "@/lib/ai/chat/review-page-plan";
import {
  CHAT_USER_INTENTS,
  type ChatUserIntentKind,
} from "@/lib/ai/chat/user-intent";

export const CHAT_DRAFT_DATASET_NAME = "chat-draft-quality-floor";

export type ChatDraftPage = {
  filename: string;
  pageNumber: number;
  attachmentId: string;
  quote: string;
};

export type ChatDraftGroundDraftCase = {
  id: string;
  task: "ground_draft";
  passCriteria: string;
  notes?: string;
  input: {
    text: string;
    context?: string;
    section: string;
    attachedFilenames?: string[];
    pages: ChatDraftPage[];
    policy?: "block" | "flag";
    tableCol?: number;
  };
  expected: {
    blocked: boolean;
    mustContain?: string[];
    mustNotContain?: string[];
    unsupportedMustContain?: string[];
    unsupportedMustBeEmpty?: boolean;
  };
};

export type ChatDraftHarnessCase = {
  id: string;
  task: "harness";
  passCriteria: string;
  notes?: string;
  input: {
    scenarioId: HarnessScenarioId;
  };
  expected: {
    intent?: ChatUserIntentKind;
    activeTools?: string[];
    activeToolsMustContain?: string[];
    activeToolsMustNotContain?: string[];
    requireInventoryReview?: boolean;
  };
};

export type ChatDraftLiveCase = {
  id: string;
  task: "live";
  passCriteria: string;
  notes?: string;
  input: {
    prompt: string;
    documentType: string;
    section?: string;
  };
  expected: {
    mustContain?: string[];
    mustNotContain?: string[];
  };
};

export const QSR_REVIEW_PAGE_PLANS = [
  "cover",
  "urs",
  "scored",
  "mixed",
] as const satisfies readonly QsrReviewPagePlan[];

export type ChatDraftPagePlanCase = {
  id: string;
  task: "page_plan";
  passCriteria: string;
  notes?: string;
  input: {
    objective: string;
    laterObjective?: string;
  };
  expected: {
    pagePlan: QsrReviewPagePlan;
    coverageDigest?: string;
    coverageDigestMustNotBe?: string[];
    isCoverWalk?: boolean;
    isUrsWalk?: boolean;
    laterObjectiveSatisfies?: boolean;
  };
};

export type ChatDraftIdentityIncompleteHit = {
  quote?: string;
  text?: string;
};

export type ChatDraftIdentityIncompleteCase = {
  id: string;
  task: "identity_incomplete";
  passCriteria: string;
  notes?: string;
  input: {
    hits: ChatDraftIdentityIncompleteHit[];
  };
  expected: {
    keepSearchOpen: boolean;
    identityIncomplete?: boolean;
    identityIncompleteHits?: number;
  };
};

export type ChatDraftEvalCase =
  | ChatDraftGroundDraftCase
  | ChatDraftHarnessCase
  | ChatDraftLiveCase
  | ChatDraftPagePlanCase
  | ChatDraftIdentityIncompleteCase;

export type ChatDraftCaseOutput = {
  id: string;
  task: ChatDraftEvalCase["task"];
  blocked?: boolean;
  text?: string;
  unsupported?: string[];
  intent?: string;
  activeTools?: string[];
  requireInventoryReview?: boolean;
  pagePlan?: QsrReviewPagePlan;
  coverageDigest?: string;
  isCoverWalk?: boolean;
  isUrsWalk?: boolean;
  laterObjectiveSatisfies?: boolean;
  identityIncomplete?: boolean;
  keepSearchOpen?: boolean;
  identityIncompleteHits?: number;
  skipped?: string;
};

export type ChatDraftCaseScore = {
  id: string;
  passed: boolean;
  failures: string[];
  output: ChatDraftCaseOutput;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIntent(
  value: unknown,
  id: string
): ChatUserIntentKind | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !(CHAT_USER_INTENTS as readonly string[]).includes(value)
  ) {
    throw new Error(`${id}: expected.intent must be social, read, or write`);
  }
  return value as ChatUserIntentKind;
}

function asStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function parsePages(value: unknown, id: string): ChatDraftPage[] {
  if (!Array.isArray(value)) {
    throw new Error(`${id}: input.pages must be an array`);
  }
  return value.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`${id}: input.pages[${index}] must be an object`);
    }
    if (
      typeof row.filename !== "string" ||
      typeof row.pageNumber !== "number" ||
      typeof row.attachmentId !== "string" ||
      typeof row.quote !== "string"
    ) {
      throw new Error(`${id}: input.pages[${index}] is missing fields`);
    }
    return {
      filename: row.filename,
      pageNumber: row.pageNumber,
      attachmentId: row.attachmentId,
      quote: row.quote,
    };
  });
}

const HARNESS_IDS = new Set(HARNESS_SCENARIOS.map((scenario) => scenario.id));

const PAGE_PLAN_IDS = new Set<string>(QSR_REVIEW_PAGE_PLANS);

function parsePagePlan(
  value: unknown,
  id: string
): QsrReviewPagePlan {
  if (
    typeof value !== "string" ||
    !PAGE_PLAN_IDS.has(value)
  ) {
    throw new Error(
      `${id}: expected.pagePlan must be cover, urs, scored, or mixed`
    );
  }
  return value as QsrReviewPagePlan;
}

function parseIdentityHits(
  value: unknown,
  id: string
): ChatDraftIdentityIncompleteHit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${id}: input.hits must be a non-empty array`);
  }
  return value.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`${id}: input.hits[${index}] must be an object`);
    }
    const quote = typeof row.quote === "string" ? row.quote : undefined;
    const text = typeof row.text === "string" ? row.text : undefined;
    if (quote === undefined && text === undefined) {
      throw new Error(`${id}: input.hits[${index}] needs quote or text`);
    }
    return { quote, text };
  });
}

function parseCase(value: unknown, index: number): ChatDraftEvalCase {
  if (!isRecord(value)) {
    throw new Error(`cases[${index}] must be an object`);
  }
  const id = value.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error(`cases[${index}] needs a non-empty id`);
  }
  if (typeof value.passCriteria !== "string" || value.passCriteria.trim().length < 12) {
    throw new Error(`${id}: passCriteria must be a readable sentence`);
  }
  const notes = typeof value.notes === "string" ? value.notes : undefined;
  const task = value.task;
  if (task === "ground_draft") {
    if (!isRecord(value.input) || !isRecord(value.expected)) {
      throw new Error(`${id}: input and expected are required`);
    }
    if (typeof value.input.text !== "string" || typeof value.input.section !== "string") {
      throw new Error(`${id}: input.text and input.section are required`);
    }
    if (typeof value.expected.blocked !== "boolean") {
      throw new Error(`${id}: expected.blocked is required`);
    }
    const attached = asStringArray(value.input.attachedFilenames, `${id}.attachedFilenames`);
    const policy = value.input.policy;
    if (policy !== undefined && policy !== "block" && policy !== "flag") {
      throw new Error(`${id}: input.policy must be block or flag`);
    }
    const tableCol = value.input.tableCol;
    if (
      tableCol !== undefined &&
      (typeof tableCol !== "number" || !Number.isInteger(tableCol) || tableCol < 0)
    ) {
      throw new Error(`${id}: input.tableCol must be a non-negative integer`);
    }
    return {
      id,
      task,
      passCriteria: value.passCriteria,
      notes,
      input: {
        text: value.input.text,
        context:
          typeof value.input.context === "string" ? value.input.context : undefined,
        section: value.input.section,
        attachedFilenames: attached,
        pages: parsePages(value.input.pages, id),
        policy,
        tableCol,
      },
      expected: {
        blocked: value.expected.blocked,
        mustContain: asStringArray(value.expected.mustContain, `${id}.mustContain`),
        mustNotContain: asStringArray(
          value.expected.mustNotContain,
          `${id}.mustNotContain`
        ),
        unsupportedMustContain: asStringArray(
          value.expected.unsupportedMustContain,
          `${id}.unsupportedMustContain`
        ),
        unsupportedMustBeEmpty:
          typeof value.expected.unsupportedMustBeEmpty === "boolean"
            ? value.expected.unsupportedMustBeEmpty
            : undefined,
      },
    };
  }
  if (task === "harness") {
    if (!isRecord(value.input) || !isRecord(value.expected)) {
      throw new Error(`${id}: input and expected are required`);
    }
    const scenarioId = value.input.scenarioId;
    if (typeof scenarioId !== "string" || !HARNESS_IDS.has(scenarioId as HarnessScenarioId)) {
      throw new Error(`${id}: input.scenarioId must be a HARNESS_SCENARIOS id`);
    }
    return {
      id,
      task,
      passCriteria: value.passCriteria,
      notes,
      input: { scenarioId: scenarioId as HarnessScenarioId },
      expected: {
        intent: parseIntent(value.expected.intent, id),
        activeTools: asStringArray(value.expected.activeTools, `${id}.activeTools`),
        activeToolsMustContain: asStringArray(
          value.expected.activeToolsMustContain,
          `${id}.activeToolsMustContain`
        ),
        activeToolsMustNotContain: asStringArray(
          value.expected.activeToolsMustNotContain,
          `${id}.activeToolsMustNotContain`
        ),
        requireInventoryReview:
          typeof value.expected.requireInventoryReview === "boolean"
            ? value.expected.requireInventoryReview
            : undefined,
      },
    };
  }
  if (task === "live") {
    if (!isRecord(value.input) || !isRecord(value.expected)) {
      throw new Error(`${id}: input and expected are required`);
    }
    if (
      typeof value.input.prompt !== "string" ||
      typeof value.input.documentType !== "string"
    ) {
      throw new Error(`${id}: live cases need input.prompt and input.documentType`);
    }
    return {
      id,
      task,
      passCriteria: value.passCriteria,
      notes,
      input: {
        prompt: value.input.prompt,
        documentType: value.input.documentType,
        section:
          typeof value.input.section === "string" ? value.input.section : undefined,
      },
      expected: {
        mustContain: asStringArray(value.expected.mustContain, `${id}.mustContain`),
        mustNotContain: asStringArray(
          value.expected.mustNotContain,
          `${id}.mustNotContain`
        ),
      },
    };
  }
  if (task === "page_plan") {
    if (!isRecord(value.input) || !isRecord(value.expected)) {
      throw new Error(`${id}: input and expected are required`);
    }
    if (typeof value.input.objective !== "string" || value.input.objective.trim() === "") {
      throw new Error(`${id}: input.objective is required`);
    }
    const laterObjective =
      typeof value.input.laterObjective === "string"
        ? value.input.laterObjective
        : undefined;
    if (
      value.expected.laterObjectiveSatisfies !== undefined &&
      laterObjective === undefined
    ) {
      throw new Error(`${id}: expected.laterObjectiveSatisfies needs input.laterObjective`);
    }
    return {
      id,
      task,
      passCriteria: value.passCriteria,
      notes,
      input: {
        objective: value.input.objective,
        laterObjective,
      },
      expected: {
        pagePlan: parsePagePlan(value.expected.pagePlan, id),
        coverageDigest:
          typeof value.expected.coverageDigest === "string"
            ? value.expected.coverageDigest
            : undefined,
        coverageDigestMustNotBe: asStringArray(
          value.expected.coverageDigestMustNotBe,
          `${id}.coverageDigestMustNotBe`
        ),
        isCoverWalk:
          typeof value.expected.isCoverWalk === "boolean"
            ? value.expected.isCoverWalk
            : undefined,
        isUrsWalk:
          typeof value.expected.isUrsWalk === "boolean"
            ? value.expected.isUrsWalk
            : undefined,
        laterObjectiveSatisfies:
          typeof value.expected.laterObjectiveSatisfies === "boolean"
            ? value.expected.laterObjectiveSatisfies
            : undefined,
      },
    };
  }
  if (task === "identity_incomplete") {
    if (!isRecord(value.input) || !isRecord(value.expected)) {
      throw new Error(`${id}: input and expected are required`);
    }
    if (typeof value.expected.keepSearchOpen !== "boolean") {
      throw new Error(`${id}: expected.keepSearchOpen is required`);
    }
    return {
      id,
      task,
      passCriteria: value.passCriteria,
      notes,
      input: { hits: parseIdentityHits(value.input.hits, id) },
      expected: {
        keepSearchOpen: value.expected.keepSearchOpen,
        identityIncomplete:
          typeof value.expected.identityIncomplete === "boolean"
            ? value.expected.identityIncomplete
            : undefined,
        identityIncompleteHits:
          typeof value.expected.identityIncompleteHits === "number"
            ? value.expected.identityIncompleteHits
            : undefined,
      },
    };
  }
  throw new Error(`${id}: unknown task ${String(task)}`);
}

export function parseChatDraftCases(raw: unknown): ChatDraftEvalCase[] {
  if (!Array.isArray(raw)) {
    throw new Error("chat-draft cases must be a JSON array");
  }
  const cases = raw.map((entry, index) => parseCase(entry, index));
  const ids = cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("chat-draft case ids must be unique");
  }
  return cases;
}

export function mergeChatDraftCases(
  publicCases: ChatDraftEvalCase[],
  overlayCases: ChatDraftEvalCase[] | null
): ChatDraftEvalCase[] {
  if (overlayCases == null || overlayCases.length === 0) return publicCases;
  const byId = new Map(publicCases.map((entry) => [entry.id, entry]));
  for (const entry of overlayCases) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function ledgerFromPages(pages: ChatDraftPage[]): CitationPageLedger {
  const ledger = new CitationPageLedger();
  for (const page of pages) {
    ledger.record(page.filename, page.pageNumber, page.attachmentId, {
      quote: page.quote,
    });
  }
  return ledger;
}

export function runChatDraftCase(entry: ChatDraftEvalCase): ChatDraftCaseOutput {
  switch (entry.task) {
    case "ground_draft": {
      const grounded = groundDraftText({
        text: entry.input.text,
        ledger: ledgerFromPages(entry.input.pages),
        policy: entry.input.policy ?? "block",
        context: entry.input.context,
        grounding: {
          section: entry.input.section,
          attachedFilenames: entry.input.attachedFilenames,
          tableCol: entry.input.tableCol,
        },
      });
      return {
        id: entry.id,
        task: entry.task,
        blocked: grounded.blocked,
        text: grounded.text,
        unsupported: grounded.unsupported.map((fact) => fact.text),
      };
    }
    case "harness": {
      const scenario = HARNESS_SCENARIOS.find(
        (row) => row.id === entry.input.scenarioId
      );
      if (!scenario) {
        return {
          id: entry.id,
          task: entry.task,
          skipped: `unknown harness scenario ${entry.input.scenarioId}`,
        };
      }
      const result = evaluateHarnessScenario(scenario);
      return {
        id: entry.id,
        task: entry.task,
        intent: result.plan.intent,
        activeTools: result.firstStep.activeTools,
        requireInventoryReview: result.requireInventoryReview,
      };
    }
    case "live":
      return {
        id: entry.id,
        task: entry.task,
        skipped:
          "Live Gemini turns are not in this runner yet. Use --replay for the quality floor; add a headless Agent turn later.",
      };
    case "page_plan": {
      const laterObjective = entry.input.laterObjective;
      return {
        id: entry.id,
        task: entry.task,
        pagePlan: qsrReviewPagePlan(entry.input.objective),
        coverageDigest: coverageObjectiveDigest(entry.input.objective),
        isCoverWalk: isQsrLifecycleCoverObjective(entry.input.objective),
        isUrsWalk: isQsrUrsWalkObjective(entry.input.objective),
        laterObjectiveSatisfies:
          laterObjective === undefined
            ? undefined
            : coverageKeySatisfiesObjective(
                `att:10:run|obj:${coverageObjectiveDigest(entry.input.objective)}`,
                laterObjective
              ),
      };
    }
    case "identity_incomplete": {
      const annotated = annotateIdentityIncompleteSearchHits(entry.input.hits);
      return {
        id: entry.id,
        task: entry.task,
        identityIncomplete: annotated.identityIncompleteHits > 0,
        keepSearchOpen: annotated.keepSearchOpen,
        identityIncompleteHits: annotated.identityIncompleteHits,
      };
    }
    default: {
      const neverTask: never = entry;
      throw new Error(`unhandled chat-draft task ${JSON.stringify(neverTask)}`);
    }
  }
}

export function scoreChatDraftCase(
  entry: ChatDraftEvalCase,
  output: ChatDraftCaseOutput
): ChatDraftCaseScore {
  const failures: string[] = [];
  if (output.skipped) {
    if (entry.task === "live") {
      return { id: entry.id, passed: true, failures: [], output };
    }
    failures.push(output.skipped);
    return { id: entry.id, passed: false, failures, output };
  }

  switch (entry.task) {
    case "ground_draft": {
      if (output.blocked !== entry.expected.blocked) {
        failures.push(
          `blocked=${String(output.blocked)} expected ${String(entry.expected.blocked)}`
        );
      }
      const hay = output.text ?? "";
      for (const needle of entry.expected.mustContain ?? []) {
        if (!hay.includes(needle)) failures.push(`missing ${JSON.stringify(needle)}`);
      }
      for (const needle of entry.expected.mustNotContain ?? []) {
        if (hay.includes(needle)) failures.push(`leaked ${JSON.stringify(needle)}`);
      }
      const unsupported = output.unsupported ?? [];
      if (entry.expected.unsupportedMustBeEmpty && unsupported.length > 0) {
        failures.push(`unsupported ${unsupported.join(", ")}`);
      }
      for (const needle of entry.expected.unsupportedMustContain ?? []) {
        if (!unsupported.includes(needle)) {
          failures.push(`unsupported missing ${JSON.stringify(needle)}`);
        }
      }
      break;
    }
    case "harness": {
      if (entry.expected.intent && output.intent !== entry.expected.intent) {
        failures.push(`intent=${output.intent} expected ${entry.expected.intent}`);
      }
      const tools = output.activeTools ?? [];
      if (entry.expected.activeTools) {
        const got = tools.join(",");
        const want = entry.expected.activeTools.join(",");
        if (got !== want) failures.push(`activeTools=[${got}] expected [${want}]`);
      }
      for (const name of entry.expected.activeToolsMustContain ?? []) {
        if (!tools.includes(name)) failures.push(`activeTools missing ${name}`);
      }
      for (const name of entry.expected.activeToolsMustNotContain ?? []) {
        if (tools.includes(name)) failures.push(`activeTools leaked ${name}`);
      }
      if (
        entry.expected.requireInventoryReview !== undefined &&
        output.requireInventoryReview !== entry.expected.requireInventoryReview
      ) {
        failures.push(
          `requireInventoryReview=${String(output.requireInventoryReview)} expected ${String(entry.expected.requireInventoryReview)}`
        );
      }
      break;
    }
    case "live":
      break;
    case "page_plan": {
      if (output.pagePlan !== entry.expected.pagePlan) {
        failures.push(
          `pagePlan=${String(output.pagePlan)} expected ${entry.expected.pagePlan}`
        );
      }
      if (
        entry.expected.coverageDigest !== undefined &&
        output.coverageDigest !== entry.expected.coverageDigest
      ) {
        failures.push(
          `coverageDigest=${JSON.stringify(output.coverageDigest)} expected ${JSON.stringify(entry.expected.coverageDigest)}`
        );
      }
      for (const needle of entry.expected.coverageDigestMustNotBe ?? []) {
        if (output.coverageDigest === needle) {
          failures.push(`coverageDigest collapsed to ${JSON.stringify(needle)}`);
        }
      }
      if (
        entry.expected.isCoverWalk !== undefined &&
        output.isCoverWalk !== entry.expected.isCoverWalk
      ) {
        failures.push(
          `isCoverWalk=${String(output.isCoverWalk)} expected ${String(entry.expected.isCoverWalk)}`
        );
      }
      if (
        entry.expected.isUrsWalk !== undefined &&
        output.isUrsWalk !== entry.expected.isUrsWalk
      ) {
        failures.push(
          `isUrsWalk=${String(output.isUrsWalk)} expected ${String(entry.expected.isUrsWalk)}`
        );
      }
      if (
        entry.expected.laterObjectiveSatisfies !== undefined &&
        output.laterObjectiveSatisfies !== entry.expected.laterObjectiveSatisfies
      ) {
        failures.push(
          `laterObjectiveSatisfies=${String(output.laterObjectiveSatisfies)} expected ${String(entry.expected.laterObjectiveSatisfies)}`
        );
      }
      break;
    }
    case "identity_incomplete": {
      if (output.keepSearchOpen !== entry.expected.keepSearchOpen) {
        failures.push(
          `keepSearchOpen=${String(output.keepSearchOpen)} expected ${String(entry.expected.keepSearchOpen)}`
        );
      }
      if (
        entry.expected.identityIncomplete !== undefined &&
        output.identityIncomplete !== entry.expected.identityIncomplete
      ) {
        failures.push(
          `identityIncomplete=${String(output.identityIncomplete)} expected ${String(entry.expected.identityIncomplete)}`
        );
      }
      if (
        entry.expected.identityIncompleteHits !== undefined &&
        output.identityIncompleteHits !== entry.expected.identityIncompleteHits
      ) {
        failures.push(
          `identityIncompleteHits=${String(output.identityIncompleteHits)} expected ${String(entry.expected.identityIncompleteHits)}`
        );
      }
      break;
    }
    default: {
      const neverTask: never = entry;
      throw new Error(`unhandled chat-draft task ${JSON.stringify(neverTask)}`);
    }
  }

  return {
    id: entry.id,
    passed: failures.length === 0,
    failures,
    output,
  };
}

export function replayChatDraftCases(
  cases: ChatDraftEvalCase[]
): ChatDraftCaseScore[] {
  return cases
    .filter((entry) => entry.task !== "live")
    .map((entry) => scoreChatDraftCase(entry, runChatDraftCase(entry)));
}

export type ChatDraftEvalCliArgs = {
  dryRun: boolean;
  replay: boolean;
  sync: boolean;
  experiment: boolean;
  live: boolean;
};

export function parseChatDraftEvalArgs(argv: string[]): ChatDraftEvalCliArgs {
  let dryRun = false;
  let replay = false;
  let sync = false;
  let experiment = false;
  let live = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--replay") replay = true;
    else if (arg === "--sync") sync = true;
    else if (arg === "--experiment") experiment = true;
    else if (arg === "--live") live = true;
    else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag ${arg}`);
    }
  }
  if (live) {
    throw new Error(
      "Live Gemini Agent turns are not wired yet. Use --replay for the quality floor, --sync / --experiment to push that floor to Langfuse."
    );
  }
  if (!replay && !sync && !experiment) dryRun = true;
  return { dryRun, replay, sync, experiment, live };
}
