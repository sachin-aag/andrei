import {
  ANDREI_BENCH_VERSION,
  runChatDraftCase,
  scoreChatDraftCase,
  type ChatDraftCaseOutput,
  type ChatDraftEvalCase,
  type ChatDraftHarnessCase,
  type ChatDraftIdentityIncompleteCase,
  type ChatDraftPagePlanCase,
} from "@/lib/eval/chat-draft-cases";

/**
 * Naive “write first”: every tool including writes on a greeting, skip the
 * empty-inventory review, collapse every QSR table ask onto a cover walk,
 * close search after the first title-only hit.
 */
const NAIVE_WRITE_TOOLS = ["draft_field", "propose_edit", "edit_table"];

export type SearchBeforeWriteRow = {
  id: string;
  task: "harness" | "page_plan" | "identity_incomplete";
  passCriteria: string;
  onPassed: boolean;
  offPassed: boolean;
  onLabel: string;
  offLabel: string;
};

export type SearchBeforeWriteReport = {
  benchVersion: string;
  n: number;
  correctOn: number;
  correctOff: number;
  rows: SearchBeforeWriteRow[];
};

function isSearchBeforeWriteCase(
  entry: ChatDraftEvalCase
): entry is
  | ChatDraftHarnessCase
  | ChatDraftPagePlanCase
  | ChatDraftIdentityIncompleteCase {
  return (
    entry.task === "harness" ||
    entry.task === "page_plan" ||
    entry.task === "identity_incomplete"
  );
}

function naiveHarness(entry: ChatDraftHarnessCase): ChatDraftCaseOutput {
  switch (entry.input.scenarioId) {
    case "greeting":
    case "empty_inventory":
      return {
        id: entry.id,
        task: "harness",
        intent: "write",
        activeTools: [...NAIVE_WRITE_TOOLS],
        requireInventoryReview: false,
      };
    case "sentence_rewrite":
    case "placeholder_fill":
    case "identifier_lookup":
      return runChatDraftCase(entry);
    default: {
      const neverId: never = entry.input.scenarioId;
      throw new Error(`unhandled harness scenario ${String(neverId)}`);
    }
  }
}

function naiveOff(entry: ChatDraftEvalCase): ChatDraftCaseOutput {
  switch (entry.task) {
    case "harness":
      return naiveHarness(entry);
    case "page_plan":
      return {
        id: entry.id,
        task: "page_plan",
        pagePlan: "cover",
        coverageDigest: "qsr_qualification_documents",
        isCoverWalk: true,
        isUrsWalk: false,
        laterObjectiveSatisfies:
          entry.input.laterObjective === undefined ? undefined : true,
      };
    case "identity_incomplete":
      return {
        id: entry.id,
        task: "identity_incomplete",
        identityIncomplete: false,
        keepSearchOpen: false,
        identityIncompleteHits: 0,
      };
    case "ground_draft":
    case "live":
      throw new Error(`${entry.id}: not a search-before-write case`);
    default: {
      const neverTask: never = entry;
      throw new Error(`unhandled chat-draft task ${JSON.stringify(neverTask)}`);
    }
  }
}

function armLabel(
  entry:
    | ChatDraftHarnessCase
    | ChatDraftPagePlanCase
    | ChatDraftIdentityIncompleteCase,
  passed: boolean
): string {
  switch (entry.task) {
    case "harness":
      if (entry.input.scenarioId === "greeting") {
        return passed ? "stayed quiet" : "wrote on hello";
      }
      if (entry.input.scenarioId === "empty_inventory") {
        return passed ? "reviewed files first" : "wrote into empty table";
      }
      return passed ? "looked first" : "wrote first";
    case "page_plan":
      if (entry.id === "qsr-table-3-only-still-cover-walk") {
        return passed ? "cover walk as asked" : "missed the cover walk";
      }
      return passed ? "kept the asked walk" : "collapsed to cover pages";
    case "identity_incomplete":
      return passed ? "kept looking" : "closed search";
    default: {
      const neverTask: never = entry;
      throw new Error(`unhandled search-before-write task ${JSON.stringify(neverTask)}`);
    }
  }
}

export function ablateSearchBeforeWrite(
  cases: readonly ChatDraftEvalCase[]
): SearchBeforeWriteReport {
  const rows: SearchBeforeWriteRow[] = cases
    .filter(isSearchBeforeWriteCase)
    .map((entry) => {
      const onPassed = scoreChatDraftCase(entry, runChatDraftCase(entry)).passed;
      const offPassed = scoreChatDraftCase(entry, naiveOff(entry)).passed;
      return {
        id: entry.id,
        task: entry.task,
        passCriteria: entry.passCriteria,
        onPassed,
        offPassed,
        onLabel: armLabel(entry, onPassed),
        offLabel: armLabel(entry, offPassed),
      };
    });
  return {
    benchVersion: ANDREI_BENCH_VERSION,
    n: rows.length,
    correctOn: rows.filter((row) => row.onPassed).length,
    correctOff: rows.filter((row) => row.offPassed).length,
    rows,
  };
}

export function formatSearchBeforeWriteReport(
  report: SearchBeforeWriteReport
): string {
  const lines = [
    `search-before-write ablation  bench=${report.benchVersion}  n=${String(report.n)} of the 20 floor cases`,
    "",
    "id".padEnd(42) + "on".padEnd(28) + "off",
    "-".repeat(88),
  ];
  for (const row of report.rows) {
    lines.push(`${row.id.padEnd(42)}${row.onLabel.padEnd(28)}${row.offLabel}`);
  }
  lines.push("-".repeat(88));
  lines.push(
    `looked before writing  Andrei on ${String(report.correctOn)}/${String(report.n)}   Andrei off ${String(report.correctOff)}/${String(report.n)}`
  );
  lines.push(
    "Not on the persist slide. A hello must not write; an empty table must look in the files first; a mixed Table 3 + SOP ask must not collapse onto cover pages."
  );
  return lines.join("\n");
}
