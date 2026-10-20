import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  reviewAttachmentPageJoin,
  reviewRunJobs,
  shouldSkipFreshCheck,
} from "@/lib/review/run-checks";
import type { FdaCriterion } from "@/lib/review/fda-criteria";

const fda: FdaCriterion[] = [
  {
    key: "fda.211_192_thorough",
    label: "Thorough",
    description: "d",
    kind: "llm",
    targetSection: "define",
    contextSections: ["define"],
  },
  {
    key: "fda.211_100b_deviation",
    label: "Deviation",
    description: "d",
    kind: "llm",
    targetSection: "define",
    contextSections: ["define"],
  },
  {
    key: "fda.oos_phase",
    label: "OOS",
    description: "d",
    kind: "llm",
    targetSection: "analyze",
    contextSections: ["analyze"],
  },
];

describe("reviewAttachmentPageJoin", () => {
  it("pins extracted pages to the active ingest and matches vault files by asset", () => {
    const names: string[] = [];
    const seen = new Set<unknown>();
    const walk = (value: unknown) => {
      if (value == null || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if ("name" in value && typeof value.name === "string") {
        names.push(value.name);
      }
      for (const child of Object.values(value)) walk(child);
    };
    walk(reviewAttachmentPageJoin());
    expect(names).toContain("asset_id");
    expect(names).toContain("attachment_id");
    expect(names).toContain("ingest_run_id");
    expect(names).toContain("active_ingest_run_id");
  });
});

describe("shouldSkipFreshCheck", () => {
  it("skips a completed run whose hash still matches", () => {
    expect(
      shouldSkipFreshCheck({
        latest: { status: "completed", contentHash: "abc" },
        contentHash: "abc",
      })
    ).toBe(true);
  });

  it("reruns failed, running, stale, or never-run checks", () => {
    expect(
      shouldSkipFreshCheck({
        latest: { status: "failed", contentHash: "abc" },
        contentHash: "abc",
      })
    ).toBe(false);
    expect(
      shouldSkipFreshCheck({
        latest: { status: "completed", contentHash: "old" },
        contentHash: "abc",
      })
    ).toBe(false);
    expect(
      shouldSkipFreshCheck({ latest: undefined, contentHash: "abc" })
    ).toBe(false);
  });
});

describe("reviewRunJobs", () => {
  it("folds FDA criteria that share a target section into one job", () => {
    const jobs = reviewRunJobs({
      checkIds: [
        "report.criteria.define",
        "fda.211_192_thorough",
        "fda.211_100b_deviation",
        "fda.oos_phase",
        "writing.grammar",
      ],
      fdaCriteria: fda,
    });
    expect(jobs.filter((job) => job.kind === "single")).toEqual([
      { kind: "single", checkId: "report.criteria.define" },
      { kind: "single", checkId: "writing.grammar" },
    ]);
    const fdaJobs = jobs.filter((job) => job.kind === "fda-section");
    expect(fdaJobs).toHaveLength(2);
    expect(
      fdaJobs
        .flatMap((job) =>
          job.kind === "fda-section"
            ? job.criteria.map((criterion) => criterion.key)
            : []
        )
        .toSorted()
    ).toEqual([
      "fda.211_100b_deviation",
      "fda.211_192_thorough",
      "fda.oos_phase",
    ]);
  });
});
