import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  buildCriterionEvaluationLlmPrompts,
  evaluateSection,
} from "@/lib/ai/evaluate";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";

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

function lastUserPrompt(): string {
  const args = lastGenerateTextArgs();
  return typeof args.prompt === "string" ? args.prompt : "";
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
    expect(PROMPT_VERSION).toBeTruthy();
    expect(prompt).not.toContain("EVALUATION_PROMPT_VERSION");
    expect(prompt).toContain(
      "Occurrence date/time and detection date/time are distinct facts"
    );
    expect(prompt).toContain("Do not rewrite the report");
    expect(prompt).not.toMatch(/<example type="strong"/);
    expect(prompt).not.toMatch(/<example type="weak"/);
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
    expect(prompt).toContain("Fewer or more than five questions are acceptable");
    expect(prompt).toContain('jump directly to "human error"');
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

  it("asks for criteria-only output without suggested fixes", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockSingleEval();

    await evaluateSection({
      section: "improve",
      content: "A corrective action was assigned.",
      reportContext: { deviationNo: "DEV-008", date: "2026-05-02" },
    });

    const prompt = lastUserPrompt();
    expect(prompt).toContain("Return one evaluation object per criterion");
    expect(prompt).toContain("Do not include suggested fixes or rewritten report text");
  });

  it("includes full structured section context in the LLM prompt", () => {
    const longLead = `${"A detailed corrective narrative sentence. ".repeat(120)}TAIL_MARKER`;
    const correctiveActions = `${"Corrective action details. ".repeat(120)}ACTION_TAIL`;
    const improveBody = `${longLead}\n${correctiveActions}`;

    const prompts = buildCriterionEvaluationLlmPrompts({
      section: "improve",
      content: {
        correctiveActions: improveBody,
      },
      reportContext: { deviationNo: "DEV-009", date: "2026-05-02" },
    });

    expect(prompts?.userPrompt).toContain("TAIL_MARKER");
    expect(prompts?.userPrompt).toContain("Corrective action details.");
    expect(prompts?.userPrompt).toContain("ACTION_TAIL");
    expect(prompts?.userPrompt).not.toContain("more corrective actions omitted");
    expect(prompts?.userPrompt).not.toContain("...");
  });

  it("keeps each LLM prompt scoped to the current section", () => {
    const prompts = buildCriterionEvaluationLlmPrompts({
      section: "control",
      content: "Control section conclusion.",
      reportContext: { deviationNo: "DEV-010", date: "2026-05-02" },
    });

    expect(prompts?.userPrompt).toContain("SECTION: CONTROL");
    expect(prompts?.userPrompt).toContain("SECTION CONTENT:");
    expect(prompts?.userPrompt).toContain("Control section conclusion.");
    expect(prompts?.userPrompt).not.toContain("FULL REPORT CONTEXT");
    expect(prompts?.userPrompt).not.toContain("## DEFINE");
  });

  it("removes imported Improve/Control template checklist boilerplate from prompt context", () => {
    const prompts = buildCriterionEvaluationLlmPrompts({
      section: "control",
      content: {
        preventiveActions:
          "Control section covers the preventive actions " +
          "Was the Preventive Action linked the classification of the root cause and explanation given for how it will prevent recurrence? " +
          "Was an Interim Plan needed to ensure a state the control while the Preventive Actions were implemented? " +
          "Does the Final Comments section include rationale to support the conclusion of the investigation and CAPA. " +
          "Preventive Action No. CAPA-001 was opened to update the PM checklist.",
      },
      reportContext: { deviationNo: "DEV-011", date: "2026-05-02" },
    });

    expect(prompts?.userPrompt).not.toContain(
      "Control section covers the preventive actions"
    );
    expect(prompts?.userPrompt).not.toContain(
      "Was the Preventive Action linked"
    );
    expect(prompts?.userPrompt).toContain(
      "Preventive Action No. CAPA-001 was opened"
    );
  });

  it("salvages evaluations when generateText throws a schema validation error", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    const oversizedResponse = JSON.stringify({
      evaluations: [
        {
          criterionKey: "measure.timeline",
          status: "partially_met",
          reasoning: "Timeline is incomplete.",
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

  it("uses uniform generation settings with seed for all sections", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    for (const section of ["define", "improve"] as const) {
      mockSingleEval();
      await evaluateSection({
        section,
        content: `Placeholder ${section} content.`,
        reportContext: { deviationNo: "DEV-006", date: "2026-05-02" },
      });

      expect(lastGenerateTextArgs()).toMatchObject({
        maxOutputTokens: 32768,
        providerOptions: {
          google: {
            seed: 0,
          },
        },
      });
    }
  });
});
