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
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        evaluations: [
          {
            criterionKey: "unknown",
            status: "met",
            reasoning: "Returned for a criterion not in this section.",
            suggestedFix: { anchorText: "", replacementText: "" },
          },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

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
});
