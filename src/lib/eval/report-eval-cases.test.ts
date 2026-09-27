import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  citedPagesFromDraft,
  clipReportEvalQuote,
  mergeReportEvalCases,
  parseReportEvalArgs,
  parseReportEvalCases,
  replayReportEvalCases,
  reportEvalNeedsSearch,
  scoreCriticLayer,
  scoreIntentLayer,
  scoreJudgeLayer,
  scoreReportEvalRetrieval,
  scoreSnapshotGold,
  slugReportEvalId,
  snapshotToReportEvalCase,
  REPORT_EVAL_QUOTE_CHARS,
  type ReportEvalCase,
} from "@/lib/eval/report-eval-cases";

const casesPath = path.join(process.cwd(), "scripts/eval/report-eval-cases.json");
const examplePath = path.join(
  process.cwd(),
  "scripts/eval/report-eval-cases.local.example.json"
);

function publicCases(): ReportEvalCase[] {
  return parseReportEvalCases(JSON.parse(readFileSync(casesPath, "utf8")));
}

describe("parseReportEvalArgs", () => {
  it("defaults to dry-run when no live flag is passed", () => {
    expect(parseReportEvalArgs([])).toMatchObject({
      dryRun: true,
      replay: false,
      sync: false,
      experiment: false,
      search: false,
      captureReportId: null,
    });
  });

  it("selects replay without implying Langfuse", () => {
    expect(parseReportEvalArgs(["--replay"])).toMatchObject({
      dryRun: false,
      replay: true,
      sync: false,
      experiment: false,
    });
  });

  it("parses capture and section", () => {
    expect(
      parseReportEvalArgs(["--capture", "rep_1", "--section", "qsr_rtm_process"])
    ).toMatchObject({
      dryRun: false,
      captureReportId: "rep_1",
      section: "qsr_rtm_process",
    });
  });

  it("selects search with a report id", () => {
    expect(parseReportEvalArgs(["--search", "--report-id", "abc"])).toMatchObject({
      dryRun: false,
      search: true,
      reportId: "abc",
    });
  });

  it("rejects --live until a headless Agent turn exists", () => {
    expect(() => parseReportEvalArgs(["--live"])).toThrow(/not wired/i);
  });
});

describe("report-eval-cases.json", () => {
  const cases = publicCases();

  it("has unique ids and a small public floor", () => {
    expect(cases.length).toBeGreaterThanOrEqual(2);
    expect(cases.length).toBeLessThanOrEqual(12);
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers QSR cover capacity, neighbour-window block, and mixed write+lookup", () => {
    const ids = new Set(cases.map((entry) => entry.id));
    expect(ids.has("qsr-rtm-cover-capacity")).toBe(true);
    expect(ids.has("qsr-rtm-neighbour-urs37")).toBe(true);
    expect(ids.has("mixed-write-and-batch-lookup")).toBe(true);
  });

  it("replays every public case against the current gate", () => {
    const failed = replayReportEvalCases(cases).filter((row) => !row.passed);
    expect(failed).toEqual([]);
  });

  it("fails a mutated cover-page case that drops 8000 L", () => {
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-capacity");
    expect(cover).toBeDefined();
    if (!cover) return;
    const failed = replayReportEvalCases([
      {
        ...cover,
        input: {
          ...cover.input,
          text: "<capacity> [User Requirement Specification.PDF, p. 1]",
        },
      },
    ])[0];
    expect(failed?.passed).toBe(false);
    expect(failed?.failures.some((row) => row.includes("8000 L"))).toBe(true);
  });

  it("lets a local overlay replace a public id", () => {
    const overlay = parseReportEvalCases(
      JSON.parse(readFileSync(examplePath, "utf8"))
    );
    const merged = mergeReportEvalCases(cases, overlay);
    expect(merged.filter((entry) => entry.id === "qsr-rtm-cover-capacity")).toHaveLength(
      1
    );
  });
});

describe("citedPagesFromDraft", () => {
  it("reads parked Citations: rows and inline source brackets", () => {
    const text = [
      "Capacity 8000 L [1]",
      "",
      "Citations:",
      "1. [User Requirement Specification.PDF, p. 1]",
      "Jacket loop [protocol.pdf, p. 4]",
    ].join("\n");
    expect(citedPagesFromDraft(text)).toEqual([
      { filename: "User Requirement Specification.PDF", page: 1 },
      { filename: "protocol.pdf", page: 4 },
    ]);
  });
});

describe("snapshotToReportEvalCase", () => {
  it("builds a replayable case from a drafted section snapshot", () => {
    const entry = snapshotToReportEvalCase({
      reportId: "rep_glr",
      documentNo: "QSR-GLR-1301",
      documentType: "qualification_summary_report",
      section: "qsr_rtm_process",
      sectionLabel: "5.1 RTM — Process",
      draftText: "8000 L [User Requirement Specification.PDF, p. 1]",
      attachedFilenames: ["User Requirement Specification.PDF"],
      pages: [
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 1,
          attachmentId: "urs",
          quote: "Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301",
        },
      ],
      capturedAt: "2026-09-27T00:00:00.000Z",
    });
    expect(entry.id).toBe(slugReportEvalId("QSR-GLR-1301", "qsr_rtm_process"));
    expect(entry.source?.reportId).toBe("rep_glr");
    expect(entry.expected.blocked).toBe(false);
    expect(entry.expected.goldPages?.[0]?.page).toBe(1);
    expect(reportEvalNeedsSearch(entry)).toBe(true);
    const scored = replayReportEvalCases([entry])[0];
    expect(scored?.passed).toBe(true);
  });
});

describe("scoreSnapshotGold", () => {
  it("fails when a gold page is missing from the snapshot", () => {
    const cases = publicCases();
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-capacity");
    expect(cover).toBeDefined();
    if (!cover) return;
    const layer = scoreSnapshotGold({
      ...cover,
      input: { ...cover.input, pages: [] },
    });
    expect(layer.passed).toBe(false);
    expect(layer.failures[0]).toMatch(/missing snapshot page/i);
  });
});

describe("scoreReportEvalRetrieval", () => {
  it("passes when the gold page is in the top-5 with the excerpt", () => {
    const cases = publicCases();
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-capacity");
    expect(cover).toBeDefined();
    if (!cover) return;
    const layer = scoreReportEvalRetrieval(cover, [
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        text: "Glass Lined Reactor Capacity 8000 L",
      },
    ]);
    expect(layer.passed).toBe(true);
    expect(layer.skipped).toBeUndefined();
  });

  it("fails when search returns the wrong page", () => {
    const cases = publicCases();
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-capacity");
    expect(cover).toBeDefined();
    if (!cover) return;
    const layer = scoreReportEvalRetrieval(cover, [
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 12,
        text: "signature block",
      },
    ]);
    expect(layer.passed).toBe(false);
    expect(layer.failures.some((row) => row.includes("recallAt5"))).toBe(true);
  });
});

describe("scoreCriticLayer", () => {
  it("skips reserved open-question expectations without failing", () => {
    const cases = publicCases();
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-capacity");
    expect(cover).toBeDefined();
    if (!cover) return;
    const layer = scoreCriticLayer({
      ...cover,
      expected: {
        ...cover.expected,
        openQuestionsMustContain: ["PRQR lot number"],
      },
    });
    expect(layer.passed).toBe(true);
    expect(layer.skipped).toBe("critic_not_wired");
  });
});

describe("scoreIntentLayer", () => {
  it("scores mixed write-plus-follow-up on replay without an LLM", () => {
    const mixed = publicCases().find(
      (entry) => entry.id === "mixed-write-and-batch-lookup"
    );
    expect(mixed).toBeDefined();
    if (!mixed) return;
    const layer = scoreIntentLayer(mixed);
    expect(layer.skipped).toBeUndefined();
    expect(layer.passed).toBe(true);
    expect(layer.detail).toContain("+lookup");
  });
});

describe("scoreJudgeLayer", () => {
  it("skips reserved judge rubrics without failing replay", () => {
    const mixed = publicCases().find(
      (entry) => entry.id === "mixed-write-and-batch-lookup"
    );
    expect(mixed).toBeDefined();
    if (!mixed) return;
    const layer = scoreJudgeLayer(mixed);
    expect(layer.passed).toBe(true);
    expect(layer.skipped).toBe("judge_not_wired");
  });
});

describe("clipReportEvalQuote", () => {
  it("caps long transcripts", () => {
    const quote = "word ".repeat(REPORT_EVAL_QUOTE_CHARS);
    expect(clipReportEvalQuote(quote).length).toBeLessThanOrEqual(
      REPORT_EVAL_QUOTE_CHARS
    );
  });
});
