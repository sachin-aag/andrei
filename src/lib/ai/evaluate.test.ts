import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { evaluateSection } from "@/lib/ai/evaluate";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

const COMMON_RULE_PHRASE = "traffic light system";
const PROMPT_INJECTION_GUARD = "PROMPT INJECTION GUARD";

type GenerateTextArgs = Parameters<typeof generateText>[0];

function mockSingleEval() {
  vi.mocked(generateText).mockResolvedValueOnce({
    experimental_output: {
      evaluations: [
        {
          criterionKey: "unknown",
          status: "met",
          reasoning: "Returned for a criterion not in this section.",
          suggestedFix: { kind: "none" },
        },
      ],
    },
    text: "{}",
    finishReason: "stop",
  } as unknown as Awaited<ReturnType<typeof generateText>>);
}

function lastSystemPrompt(): string {
  const args = lastGenerateTextArgs();
  return typeof args.system === "string" ? args.system : "";
}

function lastGenerateTextArgs(): GenerateTextArgs {
  const call = vi.mocked(generateText).mock.calls.at(-1);
  if (!call) throw new Error("generateText was not called");
  return call[0] as GenerateTextArgs;
}

describe("evaluateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("returns not evaluated results for empty section content without calling the model", async () => {
    const results = await evaluateSection({
      section: "define",
      content: {},
      reportContext: { deviationNo: "DEV-001", date: "2026-05-01" },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.status === "not_evaluated")).toBe(true);
    expect(results.every((result) => result.reasoning === "Section is empty.")).toBe(true);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("maps missing model evaluations to not evaluated", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockSingleEval();

    const results = await evaluateSection({
      section: "measure",
      content: "The deviation was observed during production.",
      reportContext: { deviationNo: "DEV-002", date: new Date("2026-05-01") },
      previousSections: [{ section: "define", content: "Previous section content." }],
    });

    expect(generateText).toHaveBeenCalledOnce();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.status === "not_evaluated")).toBe(true);
    expect(results[0]?.reasoning).toBe("No evaluation returned by model.");
  });

  it("composes the system prompt for define with common rules plus define-specific guidance", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockSingleEval();

    await evaluateSection({
      section: "define",
      content: "While performing SST on I/QC/018 the result was out of spec.",
      reportContext: { deviationNo: "DEV-003", date: "2026-05-02" },
    });

    const prompt = lastSystemPrompt();
    expect(prompt).toContain(COMMON_RULE_PHRASE);
    expect(prompt).toContain(PROMPT_INJECTION_GUARD);
    expect(prompt).toContain("SECTION ROLE - DEFINE");
    expect(prompt).toContain("Distinguish occurrence date/time and detection date/time");
    expect(prompt).toContain("maximum 600 characters");
    expect(prompt).toMatch(/<example type="strong"/);
    expect(prompt).toMatch(/<example type="weak"/);
  });

  it("composes the system prompt for analyze with the either-or 5-Why/6M rule and length flexibility", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockSingleEval();

    await evaluateSection({
      section: "analyze",
      content: { investigationOutcome: "Investigation outcome placeholder." },
      reportContext: { deviationNo: "DEV-004", date: "2026-05-02" },
    });

    const prompt = lastSystemPrompt();
    expect(prompt).toContain(COMMON_RULE_PHRASE);
    expect(prompt).toContain("SECTION ROLE - ANALYZE");
    expect(prompt).toContain("5-Why and 6M are alternatives");
    expect(prompt).toContain("Each item in \"ops\" MUST be a JSON object");
    expect(prompt).toContain("Fewer or more than five questions are acceptable");
    expect(prompt).toContain("collapses to human error");
  });

  it("includes section-specific roles in measure, improve, and control prompts", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    for (const section of ["measure", "improve", "control"] as const) {
      mockSingleEval();
      await evaluateSection({
        section,
        content: "Placeholder section content.",
        reportContext: { deviationNo: "DEV-005", date: "2026-05-02" },
      });
      const prompt = lastSystemPrompt();
      expect(prompt).toContain(COMMON_RULE_PHRASE);
      expect(prompt).toContain(`SECTION ROLE - ${section.toUpperCase()}`);
    }
  });

  it("salvages evaluations when generateText throws a schema validation error", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    const oversizedResponse = JSON.stringify({
      evaluations: [
        {
          criterionKey: "measure.timeline",
          status: "partially_met",
          reasoning: "Timeline is incomplete.",
          suggestedFix: {
            kind: "patch",
            anchorText: "short anchor",
            replacementText: "x".repeat(5000), // exceeds any limit
          },
        },
      ],
    });

    // Simulate the error shape thrown by generateText + Output.object()
    const err = Object.assign(
      new Error("No object generated: response did not match schema."),
      { text: oversizedResponse }
    );
    vi.mocked(generateText).mockRejectedValueOnce(err);

    const results = await evaluateSection({
      section: "measure",
      content: "The deviation was observed during production.",
      reportContext: { deviationNo: "DEV-007", date: "2026-05-01" },
    });

    expect(results.length).toBeGreaterThan(0);
    // The salvaged criterion should appear as not_evaluated (key doesn't match
    // any real measure criterion), but importantly it didn't throw.
    expect(results.every((r) => r.status === "not_evaluated")).toBe(true);
  });

  it("uses larger output and thinking budgets for heavy reasoning sections", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockSingleEval();
    await evaluateSection({
      section: "improve",
      content: "Placeholder improve content.",
      reportContext: { deviationNo: "DEV-006", date: "2026-05-02" },
    });

    expect(lastGenerateTextArgs()).toMatchObject({
      maxOutputTokens: 32768,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 8192,
            includeThoughts: false,
          },
        },
      },
    });

    mockSingleEval();
    await evaluateSection({
      section: "define",
      content: "Placeholder define content.",
      reportContext: { deviationNo: "DEV-006", date: "2026-05-02" },
    });

    expect(lastGenerateTextArgs()).toMatchObject({
      maxOutputTokens: 16384,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: false,
          },
        },
      },
    });
  });
});
