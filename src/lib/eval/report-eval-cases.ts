/**
 * Report-shaped quality floor.
 *
 * One case is a drafted section from a real (or synthetic) report: the
 * pages it cited, the text that must stay grounded, and optional retrieval
 * gold so `--search` can score hybrid search against that same report.
 *
 * Critic / open-question fields are reserved. Replay skips them until a
 * critic exists — do not fail the floor for an unimplemented layer.
 */
import {
  classifyChatUserIntent,
  type ChatUserIntentKind,
} from "@/lib/ai/chat/user-intent";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import {
  parseSourceCitation,
  isSourceCitationBracket,
} from "@/lib/placeholders/citation-bracket";
import {
  classifyRetrievalQuery,
  type RetrievalQueryKind,
} from "@/lib/attachments/retrieval-query";
import {
  excerptHitAtK,
  filenameMatches,
  noFalsePositiveAtK,
  recallAtK,
  type RetrievalGoldHit,
  type RankedFilenamePageText,
} from "@/lib/attachments/retrieval-metrics";
import {
  citationListEntriesFromText,
  extractCitationBrackets,
} from "@/lib/suggestions/citations-at-end";
import {
  runChatDraftCase,
  scoreChatDraftCase,
  type ChatDraftCaseScore,
  type ChatDraftGroundDraftCase,
  type ChatDraftPage,
} from "@/lib/eval/chat-draft-cases";

export const REPORT_EVAL_DATASET_NAME = "report-quality-scenarios";
export const REPORT_EVAL_QUOTE_CHARS = 2_000;
export const REPORT_EVAL_FACT_CAP = 8;

export type ReportEvalGoldPage = RetrievalGoldHit;

export type ReportEvalSource = {
  reportId?: string;
  documentNo?: string;
  langfuseTraceId?: string;
  capturedAt?: string;
};

export type ReportEvalCase = {
  id: string;
  passCriteria: string;
  notes?: string;
  source?: ReportEvalSource;
  input: {
    documentType: string;
    section: string;
    objective: string;
    query?: string;
    kind?: RetrievalQueryKind;
    /** Latest user turn for mixed-intent scoring. Defaults to objective. */
    userText?: string;
    text: string;
    context?: string;
    attachedFilenames?: string[];
    pages: ChatDraftPage[];
    policy?: "block" | "flag";
  };
  expected: {
    goldPages?: ReportEvalGoldPage[];
    mustNotContainAnywhere?: string[];
    blocked: boolean;
    mustContain?: string[];
    mustNotContain?: string[];
    unsupportedMustContain?: string[];
    unsupportedMustBeEmpty?: boolean;
    intentKind?: ChatUserIntentKind;
    alsoLookup?: boolean;
    /** Reserved: critic/open-question graph. Skipped until wired. */
    openQuestionsMustContain?: string[];
    criticHolesMustContain?: string[];
    /**
     * Reserved: LLM-as-judge rubric for mixed-turn completeness / taste.
     * Replay skips until `--live` or a Langfuse judge evaluator is wired.
     */
    judgeRubric?: string;
    assistantMustContain?: string[];
  };
};

export type ReportEvalLayerScore = {
  name: "grounding" | "snapshot_gold" | "retrieval" | "intent" | "critic" | "judge";
  passed: boolean;
  skipped?: string;
  failures: string[];
  detail?: string;
};

export type ReportEvalCaseScore = {
  id: string;
  passed: boolean;
  failures: string[];
  layers: ReportEvalLayerScore[];
  grounding: ChatDraftCaseScore;
};

export type ReportEvalSnapshot = {
  reportId: string;
  documentNo: string;
  documentType: string;
  section: string;
  sectionLabel?: string;
  draftText: string;
  attachedFilenames: string[];
  pages: ChatDraftPage[];
  langfuseTraceId?: string;
  capturedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseGoldPages(value: unknown, id: string): ReportEvalGoldPage[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${id}: expected.goldPages must be an array`);
  }
  return value.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`${id}: expected.goldPages[${index}] must be an object`);
    }
    if (typeof row.filename !== "string" || typeof row.page !== "number") {
      throw new Error(`${id}: expected.goldPages[${index}] needs filename and page`);
    }
    return {
      filename: row.filename,
      page: row.page,
      mustContain: asStringArray(
        row.mustContain,
        `${id}.goldPages[${index}].mustContain`
      ),
    };
  });
}

function parseKind(value: unknown, id: string): RetrievalQueryKind | undefined {
  if (value === undefined) return undefined;
  if (value !== "identifier" && value !== "locator" && value !== "semantic") {
    throw new Error(`${id}: input.kind must be identifier, locator, or semantic`);
  }
  return value;
}

function parseIntentKind(value: unknown, id: string): ChatUserIntentKind | undefined {
  if (value === undefined) return undefined;
  if (value !== "social" && value !== "read" && value !== "write") {
    throw new Error(`${id}: expected.intentKind must be social, read, or write`);
  }
  return value;
}

function parseSource(value: unknown, id: string): ReportEvalSource | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${id}: source must be an object`);
  }
  return {
    reportId: typeof value.reportId === "string" ? value.reportId : undefined,
    documentNo: typeof value.documentNo === "string" ? value.documentNo : undefined,
    langfuseTraceId:
      typeof value.langfuseTraceId === "string" ? value.langfuseTraceId : undefined,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : undefined,
  };
}

export function parseReportEvalCase(value: unknown, index: number): ReportEvalCase {
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
  if (!isRecord(value.input) || !isRecord(value.expected)) {
    throw new Error(`${id}: input and expected are required`);
  }
  if (
    typeof value.input.documentType !== "string" ||
    typeof value.input.section !== "string" ||
    typeof value.input.objective !== "string" ||
    typeof value.input.text !== "string"
  ) {
    throw new Error(
      `${id}: input.documentType, section, objective, and text are required`
    );
  }
  if (typeof value.expected.blocked !== "boolean") {
    throw new Error(`${id}: expected.blocked is required`);
  }
  const policy = value.input.policy;
  if (policy !== undefined && policy !== "block" && policy !== "flag") {
    throw new Error(`${id}: input.policy must be block or flag`);
  }
  return {
    id,
    passCriteria: value.passCriteria,
    notes: typeof value.notes === "string" ? value.notes : undefined,
    source: parseSource(value.source, id),
    input: {
      documentType: value.input.documentType,
      section: value.input.section,
      objective: value.input.objective,
      query: typeof value.input.query === "string" ? value.input.query : undefined,
      kind: parseKind(value.input.kind, id),
      userText:
        typeof value.input.userText === "string" ? value.input.userText : undefined,
      text: value.input.text,
      context:
        typeof value.input.context === "string" ? value.input.context : undefined,
      attachedFilenames: asStringArray(
        value.input.attachedFilenames,
        `${id}.attachedFilenames`
      ),
      pages: parsePages(value.input.pages, id),
      policy,
    },
    expected: {
      goldPages: parseGoldPages(value.expected.goldPages, id),
      mustNotContainAnywhere: asStringArray(
        value.expected.mustNotContainAnywhere,
        `${id}.mustNotContainAnywhere`
      ),
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
      intentKind: parseIntentKind(value.expected.intentKind, id),
      alsoLookup:
        typeof value.expected.alsoLookup === "boolean"
          ? value.expected.alsoLookup
          : undefined,
      openQuestionsMustContain: asStringArray(
        value.expected.openQuestionsMustContain,
        `${id}.openQuestionsMustContain`
      ),
      criticHolesMustContain: asStringArray(
        value.expected.criticHolesMustContain,
        `${id}.criticHolesMustContain`
      ),
      judgeRubric:
        typeof value.expected.judgeRubric === "string"
          ? value.expected.judgeRubric
          : undefined,
      assistantMustContain: asStringArray(
        value.expected.assistantMustContain,
        `${id}.assistantMustContain`
      ),
    },
  };
}

export function parseReportEvalCases(raw: unknown): ReportEvalCase[] {
  if (!Array.isArray(raw)) {
    throw new Error("report-eval cases must be a JSON array");
  }
  const cases = raw.map((entry, index) => parseReportEvalCase(entry, index));
  const ids = cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("report-eval case ids must be unique");
  }
  return cases;
}

export function mergeReportEvalCases(
  publicCases: ReportEvalCase[],
  overlayCases: ReportEvalCase[] | null
): ReportEvalCase[] {
  if (overlayCases == null || overlayCases.length === 0) return publicCases;
  const byId = new Map(publicCases.map((entry) => [entry.id, entry]));
  for (const entry of overlayCases) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function toGroundDraftCase(entry: ReportEvalCase): ChatDraftGroundDraftCase {
  return {
    id: entry.id,
    task: "ground_draft",
    passCriteria: entry.passCriteria,
    input: {
      text: entry.input.text,
      context: entry.input.context,
      section: entry.input.section,
      attachedFilenames: entry.input.attachedFilenames,
      pages: entry.input.pages,
      policy: entry.input.policy,
    },
    expected: {
      blocked: entry.expected.blocked,
      mustContain: entry.expected.mustContain,
      mustNotContain: entry.expected.mustNotContain,
      unsupportedMustContain: entry.expected.unsupportedMustContain,
      unsupportedMustBeEmpty: entry.expected.unsupportedMustBeEmpty,
    },
  };
}

export function scoreSnapshotGold(entry: ReportEvalCase): ReportEvalLayerScore {
  const gold = entry.expected.goldPages ?? [];
  if (gold.length === 0) {
    return {
      name: "snapshot_gold",
      passed: true,
      skipped: "no goldPages",
      failures: [],
    };
  }
  const failures: string[] = [];
  for (const hit of gold) {
    const page = entry.input.pages.find(
      (row) =>
        filenameMatches(row.filename, hit.filename) && row.pageNumber === hit.page
    );
    if (!page) {
      failures.push(`missing snapshot page ${hit.filename} p. ${hit.page}`);
      continue;
    }
    for (const needle of hit.mustContain ?? []) {
      const hay = page.quote.replace(/\s+/g, " ").toLowerCase();
      const want = needle.replace(/\s+/g, " ").toLowerCase();
      if (!hay.includes(want)) {
        failures.push(
          `snapshot quote for ${hit.filename} p. ${hit.page} missing ${JSON.stringify(needle)}`
        );
      }
    }
  }
  return { name: "snapshot_gold", passed: failures.length === 0, failures };
}

export function scoreIntentLayer(entry: ReportEvalCase): ReportEvalLayerScore {
  const wantsKind = entry.expected.intentKind !== undefined;
  const wantsLookup = entry.expected.alsoLookup !== undefined;
  if (!wantsKind && !wantsLookup) {
    return {
      name: "intent",
      passed: true,
      skipped: "no intent expectations",
      failures: [],
    };
  }
  const userText = (entry.input.userText ?? entry.input.objective).trim();
  const decision = classifyChatUserIntent({ userText, mode: "agent" });
  const failures: string[] = [];
  if (wantsKind && decision.kind !== entry.expected.intentKind) {
    failures.push(
      `intentKind=${decision.kind} expected ${entry.expected.intentKind}`
    );
  }
  if (wantsLookup && (decision.alsoLookup === true) !== entry.expected.alsoLookup) {
    failures.push(
      `alsoLookup=${decision.alsoLookup === true} expected ${entry.expected.alsoLookup}`
    );
  }
  return {
    name: "intent",
    passed: failures.length === 0,
    failures,
    detail: `${decision.kind}${decision.alsoLookup ? "+lookup" : ""}`,
  };
}

export function scoreJudgeLayer(entry: ReportEvalCase): ReportEvalLayerScore {
  const wantsRubric = (entry.expected.judgeRubric?.trim().length ?? 0) > 0;
  const wantsReply = (entry.expected.assistantMustContain?.length ?? 0) > 0;
  if (!wantsRubric && !wantsReply) {
    return {
      name: "judge",
      passed: true,
      skipped: "no judge expectations",
      failures: [],
    };
  }
  return {
    name: "judge",
    passed: true,
    skipped: "judge_not_wired",
    failures: [],
    detail:
      "LLM-as-judge is reserved for Langfuse --experiment / live turns. Replay does not fail this layer.",
  };
}

export function scoreCriticLayer(entry: ReportEvalCase): ReportEvalLayerScore {
  const wantsQuestions = (entry.expected.openQuestionsMustContain?.length ?? 0) > 0;
  const wantsHoles = (entry.expected.criticHolesMustContain?.length ?? 0) > 0;
  if (!wantsQuestions && !wantsHoles) {
    return {
      name: "critic",
      passed: true,
      skipped: "no critic expectations",
      failures: [],
    };
  }
  return {
    name: "critic",
    passed: true,
    skipped: "critic_not_wired",
    failures: [],
    detail:
      "Open-question / critic scoring is reserved. Replay does not fail this layer yet.",
  };
}

export function scoreReportEvalRetrieval(
  entry: ReportEvalCase,
  ranked: RankedFilenamePageText[]
): ReportEvalLayerScore {
  const gold = entry.expected.goldPages ?? [];
  if (gold.length === 0 && (entry.expected.mustNotContainAnywhere?.length ?? 0) === 0) {
    return {
      name: "retrieval",
      passed: true,
      skipped: "no retrieval gold",
      failures: [],
    };
  }
  const leak = noFalsePositiveAtK(ranked, entry.expected.mustNotContainAnywhere, 5);
  const excerptHit = excerptHitAtK(ranked, gold, 5);
  const recallAt5 = gold.length > 0 ? recallAtK(ranked, gold, 5) : null;
  const failures: string[] = [];
  if (leak === 0) {
    failures.push("mustNotContainAnywhere leaked into a top-5 excerpt");
  }
  if (gold.length > 0 && (recallAt5 == null || recallAt5 < 1)) {
    failures.push(
      `recallAt5=${recallAt5 == null ? "n/a" : recallAt5.toFixed(2)} expected 1.00`
    );
  }
  if (excerptHit === 0) {
    failures.push("gold excerpt mustContain missing from the matching top-5 hit");
  }
  return {
    name: "retrieval",
    passed: failures.length === 0,
    failures,
    detail: `R@5=${recallAt5 == null ? "n/a" : recallAt5.toFixed(2)} excerpt@5=${
      excerptHit == null ? "n/a" : excerptHit.toFixed(2)
    }`,
  };
}

export function replayReportEvalCase(entry: ReportEvalCase): ReportEvalCaseScore {
  const groundingCase = toGroundDraftCase(entry);
  const grounding = scoreChatDraftCase(
    groundingCase,
    runChatDraftCase(groundingCase)
  );
  const layers: ReportEvalLayerScore[] = [
    {
      name: "grounding",
      passed: grounding.passed,
      failures: grounding.failures,
    },
    scoreSnapshotGold(entry),
    scoreIntentLayer(entry),
    {
      name: "retrieval",
      passed: true,
      skipped: "replay is offline; pass --search --report-id for live hybrid search",
      failures: [],
    },
    scoreCriticLayer(entry),
    scoreJudgeLayer(entry),
  ];
  const scored = layers.filter((layer) => !layer.skipped);
  const failures = scored.flatMap((layer) =>
    layer.failures.map((row) => `${layer.name}: ${row}`)
  );
  return {
    id: entry.id,
    passed: scored.every((layer) => layer.passed),
    failures,
    layers,
    grounding,
  };
}

export function replayReportEvalCases(cases: ReportEvalCase[]): ReportEvalCaseScore[] {
  return cases.map((entry) => replayReportEvalCase(entry));
}

export function reportEvalNeedsSearch(entry: ReportEvalCase): boolean {
  return Boolean(
    entry.input.query?.trim() &&
      ((entry.expected.goldPages?.length ?? 0) > 0 ||
        (entry.expected.mustNotContainAnywhere?.length ?? 0) > 0)
  );
}

export type ReportEvalCliArgs = {
  dryRun: boolean;
  replay: boolean;
  sync: boolean;
  experiment: boolean;
  search: boolean;
  captureReportId: string | null;
  reportId: string | null;
  section: string | null;
  live: boolean;
};

export function parseReportEvalArgs(argv: string[]): ReportEvalCliArgs {
  let dryRun = false;
  let replay = false;
  let sync = false;
  let experiment = false;
  let search = false;
  let captureReportId: string | null = null;
  let reportId: string | null = null;
  let section: string | null = null;
  let live = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--replay") replay = true;
    else if (arg === "--sync") sync = true;
    else if (arg === "--experiment") experiment = true;
    else if (arg === "--search") search = true;
    else if (arg === "--live") live = true;
    else if (arg === "--capture" && argv[i + 1]) {
      captureReportId = argv[++i]!;
    } else if (arg === "--report-id" && argv[i + 1]) {
      reportId = argv[++i]!;
    } else if (arg === "--section" && argv[i + 1]) {
      section = argv[++i]!;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag ${arg}`);
    }
  }
  if (live) {
    throw new Error(
      "Live Gemini Agent turns are not wired yet. Capture a finished report with --capture, then --replay (grounding) and --search --report-id (retrieval)."
    );
  }
  if (!replay && !sync && !experiment && !search && !captureReportId) {
    dryRun = true;
  }
  return {
    dryRun,
    replay,
    sync,
    experiment,
    search,
    captureReportId,
    reportId,
    section,
    live,
  };
}

export type CitedSourcePage = {
  filename: string;
  page: number;
};

/** Parked Citations: list plus leftover inline `[file, p. N]` brackets. */
export function citedPagesFromDraft(
  text: string,
  knownFilenames: readonly string[] = []
): CitedSourcePage[] {
  const out: CitedSourcePage[] = [];
  const seen = new Set<string>();
  const add = (filename: string, page: number) => {
    const key = `${filename.toLowerCase()}|${page}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ filename, page });
  };
  for (const { source } of citationListEntriesFromText(text)) {
    const parsed = parseSourceCitation(source, knownFilenames);
    if (!parsed) continue;
    for (const page of parsed.pages) add(parsed.filename, page);
  }
  for (const bracket of extractCitationBrackets(text)) {
    if (!isSourceCitationBracket(bracket)) continue;
    const parsed = parseSourceCitation(bracket, knownFilenames);
    if (!parsed) continue;
    for (const page of parsed.pages) add(parsed.filename, page);
  }
  return out;
}

export function slugReportEvalId(documentNo: string, section: string): string {
  const raw = `${documentNo}-${section}`.toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 80) || "captured-section";
}

function uniqueFacts(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const fact of extractHardFacts(text)) {
    const token = fact.text.trim();
    if (!token || token.length > 80) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
    if (out.length >= REPORT_EVAL_FACT_CAP) break;
  }
  return out;
}

export function clipReportEvalQuote(quote: string): string {
  const collapsed = quote.replace(/\s+/g, " ").trim();
  if (collapsed.length <= REPORT_EVAL_QUOTE_CHARS) return collapsed;
  return collapsed.slice(0, REPORT_EVAL_QUOTE_CHARS);
}

export function snapshotToReportEvalCase(snapshot: ReportEvalSnapshot): ReportEvalCase {
  const cited = citedPagesFromDraft(snapshot.draftText, snapshot.attachedFilenames);
  const goldPages: ReportEvalGoldPage[] = cited.map((hit) => {
    const page = snapshot.pages.find(
      (row) =>
        filenameMatches(row.filename, hit.filename) && row.pageNumber === hit.page
    );
    const facts = page ? uniqueFacts(page.quote).slice(0, 3) : [];
    return {
      filename: hit.filename,
      page: hit.page,
      ...(facts.length > 0 ? { mustContain: facts } : {}),
    };
  });
  const facts = uniqueFacts(snapshot.draftText);
  const identifiers = facts.filter((token) => /urs-\d+/i.test(token));
  const query =
    identifiers.slice(0, 4).join(" ") ||
    [snapshot.sectionLabel ?? snapshot.section, goldPages[0]?.filename]
      .filter(Boolean)
      .join(" ");
  const kind = query.trim() ? classifyRetrievalQuery(query).kind : undefined;
  const label = snapshot.sectionLabel ?? snapshot.section;
  return {
    id: slugReportEvalId(snapshot.documentNo, snapshot.section),
    passCriteria: `Captured ${label} from ${snapshot.documentNo} must stay grounded against its cited pages.`,
    notes:
      "Generated by pnpm report-eval -- --capture. Edit passCriteria / mustContain, then --replay. Keep this file gitignored.",
    source: {
      reportId: snapshot.reportId,
      documentNo: snapshot.documentNo,
      langfuseTraceId: snapshot.langfuseTraceId,
      capturedAt: snapshot.capturedAt ?? new Date().toISOString(),
    },
    input: {
      documentType: snapshot.documentType,
      section: snapshot.section,
      objective: `Draft ${label}`,
      query: query.trim() || undefined,
      kind,
      text: snapshot.draftText,
      attachedFilenames: snapshot.attachedFilenames,
      pages: snapshot.pages.map((page) => ({
        ...page,
        quote: clipReportEvalQuote(page.quote),
      })),
    },
    expected: {
      goldPages: goldPages.length > 0 ? goldPages : undefined,
      blocked: false,
      mustContain: facts.length > 0 ? facts : undefined,
      unsupportedMustBeEmpty: true,
    },
  };
}
