import { describe, expect, it, vi } from "vitest";
import { scoreDraftEntailment } from "@/lib/ai/chat/entailment";
import type { ClaimProvenance } from "@/lib/ai/chat/claim-facts";

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubChat: () => true,
}));

vi.mock("@/lib/observability/langfuse-scores", () => ({
  recordGroundednessScore: vi.fn().mockResolvedValue(undefined),
}));

describe("scoreDraftEntailment", () => {
  it("returns a deterministic ratio and skips the LLM when chat is stubbed", async () => {
    const provenance: ClaimProvenance = {
      policy: "flag",
      claims: [
        {
          text: "E/PR/070",
          kind: "identifier",
          status: "verified",
        },
        {
          text: "MF-25-VIAL-01",
          kind: "identifier",
          status: "unsourced",
        },
      ],
    };
    const scored = await scoreDraftEntailment({
      draft: "E/PR/070 ran MF-25-VIAL-01",
      provenance,
      reportId: "report-1",
    });
    expect(scored).toEqual({
      supported: false,
      score: 0.5,
      note: "1/2 hard facts matched retrieved pages.",
    });
  });
});
