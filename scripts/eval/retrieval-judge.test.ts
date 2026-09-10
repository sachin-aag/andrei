import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  RETRIEVAL_JUDGE_MODEL_ID,
  RETRIEVAL_JUDGE_PROMPT_VERSION,
  buildRetrievalJudgePrompt,
  judgeRetrievalCase,
} from "./retrieval-judge";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock("@/lib/ai/resolve-google-language-model", () => ({
  resolveGoogleLanguageModel: vi.fn(() => "mock-judge-model"),
}));

describe("buildRetrievalJudgePrompt", () => {
  it("asks the judge to fail a right-page wrong-slice", () => {
    const prompt = buildRetrievalJudgePrompt({
      query: "what portable spectrum analyzer is required",
      passCriteria: "Must name Narda SRM-3006 from the required table.",
      hits: [
        {
          filename: "dv-protocol-equipment.pdf",
          pageNumber: 2,
          text: "UUT HEADER TOP-EVAL-01 Cirtronics Serial pending",
        },
      ],
    });
    expect(prompt.system).toContain("wrong slice");
    expect(prompt.user).toContain("Must name Narda SRM-3006");
    expect(prompt.user).toContain("[dv-protocol-equipment.pdf, p. 2]");
    expect(prompt.user).toContain("UUT HEADER");
  });

  it("labels empty retrieval explicitly", () => {
    const prompt = buildRetrievalJudgePrompt({
      query: "SW-LWB-4",
      passCriteria: "This ID is not in the corpus.",
      hits: [],
    });
    expect(prompt.user).toContain("(no search hits)");
    expect(prompt.system).toContain("Empty hits fail unless");
  });
});

describe("judgeRetrievalCase", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("returns structured pass/fail from the model", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { verdict: "pass", reasoning: "The Narda row is in excerpt 1." },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await judgeRetrievalCase(
      {
        query: "portable spectrum analyzer",
        passCriteria: "Must name Narda SRM-3006",
      },
      [
        {
          filename: "dv-protocol-equipment.pdf",
          pageNumber: 2,
          text: "Required Testing Equipment Portable Spectrum Analyzer Narda SRM-3006",
        },
      ]
    );

    expect(result).toEqual({
      verdict: "pass",
      reasoning: "The Narda row is in excerpt 1.",
    });
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    const args = vi.mocked(generateText).mock.calls[0]![0];
    expect(args.temperature).toBe(0);
  });

  it("throws when the model returns no object", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: undefined,
    } as unknown as Awaited<ReturnType<typeof generateText>>);
    await expect(
      judgeRetrievalCase(
        { query: "SW-EVAL-7", passCriteria: "Must include SW-EVAL-7" },
        []
      )
    ).rejects.toThrow(/no structured output/);
  });
});

describe("retrieval judge version", () => {
  it("pins a prompt version and a cheap flash-lite model", () => {
    expect(RETRIEVAL_JUDGE_PROMPT_VERSION).toMatch(/^retrieval-judge-/);
    expect(RETRIEVAL_JUDGE_MODEL_ID).toContain("flash-lite");
  });
});
