import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import { evaluateSection } from "@/lib/ai/evaluate";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

const COMMON_RULE_PHRASE = "traffic light system";
const PROMPT_INJECTION_GUARD = "PROMPT INJECTION GUARD";

type GenerateObjectArgs = Parameters<typeof generateObject>[0];

function mockSingleEval() {
  vi.mocked(generateObject).mockResolvedValueOnce({
    object: {
      evaluations: [
        {
          criterionKey: "unknown",
          status: "met",
          reasoning: "Returned for a criterion not in this section.",
          suggestedFix: { kind: "none" },
        },
      ],
    },
  } as Awaited<ReturnType<typeof generateObject>>);
}

function lastSystemPrompt(): string {
  const args = lastGenerateObjectArgs();
  return typeof args.system === "string" ? args.system : "";
}

function lastGenerateObjectArgs(): GenerateObjectArgs {
  const call = vi.mocked(generateObject).mock.calls.at(-1);
  if (!call) throw new Error("generateObject was not called");
  return call[0] as GenerateObjectArgs;
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
    expect(generateObject).not.toHaveBeenCalled();
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

    expect(generateObject).toHaveBeenCalledOnce();
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

  it("uses larger output and thinking budgets for heavy reasoning sections", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockSingleEval();
    await evaluateSection({
      section: "improve",
      content: "Placeholder improve content.",
      reportContext: { deviationNo: "DEV-006", date: "2026-05-02" },
    });

    expect(lastGenerateObjectArgs()).toMatchObject({
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
      section: "measure",
      content: "Placeholder measure content.",
      reportContext: { deviationNo: "DEV-006", date: "2026-05-02" },
    });

    expect(lastGenerateObjectArgs()).toMatchObject({
      maxOutputTokens: 8192,
    });
    expect(lastGenerateObjectArgs()).not.toHaveProperty("providerOptions");
  });
});
