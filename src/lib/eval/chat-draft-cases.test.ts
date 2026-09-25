import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeChatDraftCases,
  parseChatDraftCases,
  parseChatDraftEvalArgs,
  replayChatDraftCases,
  runChatDraftCase,
  scoreChatDraftCase,
} from "@/lib/eval/chat-draft-cases";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/chat-draft-cases.json"
);

describe("parseChatDraftEvalArgs", () => {
  it("defaults to dry-run when no live flag is passed", () => {
    expect(parseChatDraftEvalArgs([])).toMatchObject({
      dryRun: true,
      replay: false,
      sync: false,
      experiment: false,
    });
  });

  it("selects replay without implying Langfuse", () => {
    expect(parseChatDraftEvalArgs(["--replay"])).toMatchObject({
      dryRun: false,
      replay: true,
      sync: false,
      experiment: false,
    });
  });

  it("selects experiment without implying dry-run", () => {
    expect(parseChatDraftEvalArgs(["--experiment"])).toMatchObject({
      dryRun: false,
      replay: false,
      sync: false,
      experiment: true,
    });
  });

  it("rejects --live until a headless Agent turn exists", () => {
    expect(() => parseChatDraftEvalArgs(["--live"])).toThrow(/not wired/i);
  });
});

describe("chat-draft-cases.json", () => {
  const cases = parseChatDraftCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );

  it("has unique ids and a small public floor", () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
    expect(cases.length).toBeLessThanOrEqual(20);
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the QSR section 5 overblock and a greeting", () => {
    const ids = new Set(cases.map((entry) => entry.id));
    expect(ids.has("qsr-rtm-cover-8000l")).toBe(true);
    expect(ids.has("qsr-rtm-vacuum-760mmhg")).toBe(true);
    expect(ids.has("qsr-rtm-moc-ss316l")).toBe(true);
    expect(ids.has("qsr-rtm-neighbour-urs37-blocked")).toBe(true);
    expect(ids.has("harness-greeting-no-tools")).toBe(true);
  });

  it("replays every public case against the current gate", () => {
    const failed = replayChatDraftCases(cases).filter((row) => !row.passed);
    expect(failed).toEqual([]);
  });

  it("fails a mutated cover-page case that drops 8000 L", () => {
    const cover = cases.find((entry) => entry.id === "qsr-rtm-cover-8000l");
    expect(cover?.task).toBe("ground_draft");
    if (cover?.task !== "ground_draft") return;
    const output = runChatDraftCase({
      ...cover,
      input: { ...cover.input, text: "<capacity> [User Requirement Specification.PDF, p. 1]" },
    });
    const scored = scoreChatDraftCase(cover, output);
    expect(scored.passed).toBe(false);
    expect(scored.failures.some((row) => row.includes("8000 L"))).toBe(true);
  });

  it("lets a local overlay replace a public id", () => {
    const overlay = parseChatDraftCases(
      JSON.parse(
        readFileSync(
          path.join(process.cwd(), "scripts/eval/chat-draft-cases.local.example.json"),
          "utf8"
        )
      )
    );
    const merged = mergeChatDraftCases(cases, overlay);
    expect(merged.filter((entry) => entry.id === "qsr-rtm-cover-8000l")).toHaveLength(1);
  });
});
